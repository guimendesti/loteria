---
name: deploy-monorepo-vps
description: Containerizar e implantar um monorepo pnpm (Next.js + worker + Prisma) numa VPS com Traefik compartilhado. Use ao criar Dockerfile/compose para deploy, ao configurar Traefik com Let's Encrypt, ou ao depurar erros de build/runtime em container — especialmente Prisma (libssl/query engine), Next standalone, envs vazias e SSH/Windows. Contém 7 bugs reais já diagnosticados que não aparecem em desenvolvimento.
---

# Deploy de monorepo pnpm em VPS com Traefik compartilhado

Lições extraídas de um deploy real (Next.js 15 + BullMQ worker + Prisma + Postgres + Redis).
**Todos os problemas abaixo passaram no `typecheck` e em 555 testes, e mesmo assim quebraram
em produção.** A causa comum: o ambiente de desenvolvimento mascara as condições reais.

## Regra número 1

> `typecheck` verde ≠ `build` funciona. `build` funciona ≠ container sobe.
> Container sobe ≠ aplicação funciona.

Rode **`next build` dentro do container** antes de considerar qualquer coisa pronta, e depois
suba o container e faça requisições reais. Se o app grava no banco, **crie um usuário de verdade** —
foi assim que descobrimos que o cadastro estava 100% quebrado (FK obrigatória nunca preenchida).

---

## Os 7 bugs (e como evitá-los)

### 1. Config de build importando código com JSX

`tailwind.config.ts` importava o índice de um pacote do workspace que reexporta componentes `.tsx`.
O **jiti** (que carrega configs TS) não resolve JSX → `next build` quebra.

✅ **Importe o módulo específico**, nunca o índice do pacote:
```ts
import { colors } from '@meu/ui/src/tokens'   // ✔ TS puro
// import { colors } from '@meu/ui'           // �’ puxa .tsx e quebra
```

### 2. Prisma: engine errado + binário `openssl` ausente

Duas coisas distintas, ambas necessárias:

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "debian-openssl-3.0.x"]  // alvo da imagem
}
```

```dockerfile
FROM node:20-slim AS base
# O Prisma usa o BINÁRIO openssl para DETECTAR a versão da libssl.
# node:20-slim traz libssl3 mas não o binário → assume 1.1.x e falha com
# "libssl.so.1.1: cannot open shared object file".
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
```

> Prefira **`node:20-slim` (Debian/glibc)** a `node:20-alpine` (musl): os engines do Prisma
> são notoriamente instáveis no Alpine, e você economiza um `apk add` (dependência de rede).

### 3. `output: standalone` não empacota o engine nativo do Prisma

O rastreador do Next só segue imports **JS** — o `.so.node` fica de fora e o runtime falha com
*"Prisma Client could not locate the Query Engine"*.

```dockerfile
# no stage de build, DEPOIS do prisma generate:
RUN PRISMA_CLIENT_DIR="$(dirname "$(find /app/node_modules/.pnpm -path '*/.prisma/client/index.js' | head -1)")" \
    && mkdir -p /prisma-runtime && cp -r "$PRISMA_CLIENT_DIR"/. /prisma-runtime/

# no stage de runtime:
COPY --from=build --chown=nextjs:nodejs /prisma-runtime ./prisma-runtime
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/prisma-runtime/libquery_engine-debian-openssl-3.0.x.so.node
```

O caminho real contém o hash de versão do pnpm — por isso o `find`, não um caminho literal.

### 4. O build exige banco no ar

Páginas que consultam o banco em Server Components são **pré-renderizadas no `next build`** —
que roda no container, sem banco. Um erro não tratado derruba o build inteiro.

✅ **Todo loader de dados usado em prerender precisa de guard:**
```ts
export const getData = cache(async (slug: string) => {
  try { return await queryData(slug) } catch { return null }   // build sem banco → null
})
```

E na página, **distinga "não existe" de "sem dados ainda"**:
```ts
if (!data) {
  if (!isValidSlug(slug)) notFound()        // 404 de verdade
  return <EmptyState/>                       // estado transitório; ISR preenche depois
}
```
Sem isso a página vira **404 estático permanente** até a revalidação.

### 5. Envs opcionais vazias derrubam o serviço

`docker compose` com `${VAR:-}` **sempre injeta** a variável — vazia quando não definida.
`z.string().min(1).optional()` só aceita `undefined` → crash-loop.

```ts
function optionalEnv() {
  return z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().min(1).optional(),
  )
}
```

### 6. FK obrigatória que a lib de auth não conhece

Se `User` tem uma FK obrigatória (ex.: `tenantId`) que o Better Auth/NextAuth não preenche,
**todo cadastro falha** com `Argument 'tenant' is missing`. Resolva no hook de criação:

```ts
databaseHooks: { user: { create: { before: async (user) => ({
  data: { ...user, tenantId: await getDefaultTenantId() },
}) } } }
```

### 7. APIs públicas bloqueiam IPs de datacenter

Uma API que responde 200 da sua máquina pode responder **403 da VPS** — bloqueio por origem
(ASN/datacenter), que **nenhum cabeçalho contorna** (testado com User-Agent, Referer, Origin
completos). Se o produto depende de dados externos, **projete o fallback desde o início**:
provider primário + espelho + circuit breaker, atrás de uma interface única.

E garanta que **scripts de smoke usem a mesma cadeia do bootstrap** — um smoke que instancia o
provider direto mascara o problema.

---

## Dockerfile de referência (multi-stage, alvos web + worker)

```dockerfile
FROM node:20-slim AS base
RUN npm install -g pnpm@9        # corepack falha com verificação de assinatura em alguns ambientes
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
# só os manifestos → camada cacheável
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
# ... um COPY por pacote do workspace
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm -F @app/db exec prisma generate      # ANTES do next build
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN pnpm -F @app/web build
RUN PRISMA_CLIENT_DIR="$(dirname "$(find /app/node_modules/.pnpm -path '*/.prisma/client/index.js' | head -1)")" \
    && mkdir -p /prisma-runtime && cp -r "$PRISMA_CLIENT_DIR"/. /prisma-runtime/

FROM base AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/web/public/ ./apps/web/public/
COPY --from=build --chown=nextjs:nodejs /prisma-runtime ./prisma-runtime
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/prisma-runtime/libquery_engine-debian-openssl-3.0.x.so.node
USER nextjs
CMD ["node", "apps/web/server.js"]
```

`next.config.mjs` em monorepo:
```js
output: 'standalone',
outputFileTracingRoot: path.join(import.meta.dirname, '../../'),  // senão perde os pacotes
transpilePackages: ['@app/core', '@app/db', '@app/ui'],
```

---

## Traefik compartilhado: descubra a convenção, não a assuma

**Nunca chute** o nome da rede ou do certresolver. Leia de um serviço que já funciona:

```bash
docker network ls
docker inspect <container-traefik> -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{println}}{{end}}'
docker inspect <app-existente> -f '{{range $k,$v := .Config.Labels}}{{$k}}={{$v}}{{println}}{{end}}' | grep -i traefik
```

Depois parametrize no compose (com defaults, mas configuráveis por `.env`):

```yaml
services:
  web:
    networks: [internal, traefik]
    labels:
      - traefik.enable=true
      - traefik.docker.network=${TRAEFIK_NETWORK:-traefik}
      - traefik.http.routers.app.rule=Host(`${DOMAIN}`)
      - traefik.http.routers.app.entrypoints=${TRAEFIK_ENTRYPOINT:-websecure}
      - traefik.http.routers.app.tls.certresolver=${TRAEFIK_CERTRESOLVER:-letsencrypt}
      - traefik.http.services.app.loadbalancer.server.port=3000
networks:
  internal:
  traefik: { external: true, name: ${TRAEFIK_NETWORK:-traefik} }
```

**Banco e cache ficam só na rede `internal`**, sem porta publicada. Só o web entra na rede do Traefik.

## Migrations como serviço one-shot

```yaml
migrate:
  build: { context: ., target: worker }
  restart: "no"
  command: sh -c "pnpm -F @app/db exec prisma migrate deploy && pnpm -F @app/db seed"
  depends_on: { postgres: { condition: service_healthy } }
web:
  depends_on:
    migrate: { condition: service_completed_successfully }
```
Assim nunca há app servindo contra schema desatualizado.

---

## SSH a partir do Windows

`sshpass` **corrompe senhas com caracteres especiais** (`&`, `$`, `!`). Se a senha está correta e
mesmo assim dá *Permission denied*, use o `plink` do PuTTY antes de concluir que a credencial é inválida:

```bash
plink -ssh -batch -hostkey "SHA256:..." -pw "$PASS" root@host "comando"
```
Descubra o fingerprint rodando uma vez sem `-hostkey` (ele imprime e aborta em batch mode).

Wrapper reutilizável:
```bash
cat > /tmp/plk.sh <<'EOF'
#!/bin/bash
PASS=$(cat /caminho/.vps_pass | tr -d '\r\n')
plink -ssh -batch -hostkey "SHA256:..." -pw "$PASS" root@HOST "$@"
EOF
chmod +x /tmp/plk.sh
```

⚠️ Não fique repetindo tentativas de senha contra um servidor. Se falhar 2–3 vezes, **troque de
ferramenta** (plink) ou peça a credencial/chave correta.

## Cuidado destrutivo: shadow database do Prisma

`prisma migrate diff --shadow-database-url` **APAGA** o banco apontado. Nunca aponte para o banco
de desenvolvimento com dados. Se o ambiente for não-interativo (onde `migrate dev` recusa rodar),
gere o SQL manualmente e aplique com `migrate deploy`.

## Checklist de deploy

- [ ] `next build` roda **dentro do container**, sem banco
- [ ] Container sobe e responde 200 nas rotas principais
- [ ] Rota inexistente responde 404 (e não 200 genérico)
- [ ] **Cadastro de usuário real funciona** (pega FK/hook faltando)
- [ ] Login + acesso a área protegida + **bloqueio de role sem permissão**
- [ ] Migrations aplicadas e seed rodado
- [ ] Certificado emitido: `openssl s_client -connect dominio:443 | openssl x509 -noout -issuer -dates`
- [ ] Serviços internos sem porta publicada
- [ ] Segredos gerados no servidor (`openssl rand`), `.env` com `chmod 600` e no `.gitignore`
