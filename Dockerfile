# LotoPro — imagem multi-stage do monorepo pnpm.
# Alvos: `web` (Next.js standalone) e `worker` (BullMQ via tsx).
#   docker build --target web    -t lotopro-web .
#   docker build --target worker -t lotopro-worker .

# ─── Base ────────────────────────────────────────────────────────────────────
FROM node:20-slim AS base
# corepack falha com verificação de assinatura em alguns ambientes — npm é mais estável
RUN npm install -g pnpm@9.15.9
# O Prisma precisa do BINÁRIO openssl para detectar a versão da libssl; sem ele
# assume openssl-1.1.x e falha com "libssl.so.1.1: cannot open shared object file",
# mesmo com binaryTargets correto no schema. (node:20-slim traz libssl3, não o binário.)
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

# ─── Dependências (camada cacheável: só manifestos) ──────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json           apps/web/
COPY apps/worker/package.json        apps/worker/
COPY packages/core/package.json      packages/core/
COPY packages/db/package.json        packages/db/
COPY packages/ui/package.json        packages/ui/
COPY packages/integrations/package.json packages/integrations/
RUN pnpm install --frozen-lockfile

# ─── Build ───────────────────────────────────────────────────────────────────
FROM deps AS build
COPY . .
# Prisma Client precisa existir ANTES do build do Next (o app importa @lotopro/db).
RUN pnpm -F @lotopro/db exec prisma generate
# DATABASE_URL fictícia: o build faz prerender de páginas que tocam o banco;
# elas caem no fallback de erro e são revalidadas por ISR em runtime.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NEXT_TELEMETRY_DISABLED=1
# O domínio público PRECISA existir no build, não só em runtime: `sitemap.ts` e
# `robots.ts` são pré-renderizados aqui e assam a URL base no arquivo. Sem isto
# eles saem com o domínio de fallback de `(marketing)/lib/site.ts` e servem, em
# produção, um `Sitemap:` apontando para outro host — o `robots.txt` nem se
# corrige sozinho (não faz query, logo nunca revalida com dado novo).
ARG BETTER_AUTH_URL="http://localhost:3000"
ENV BETTER_AUTH_URL=$BETTER_AUTH_URL
RUN pnpm -F @lotopro/web build

# O `output: standalone` do Next NÃO inclui o engine nativo do Prisma (.so.node) —
# o rastreador só segue imports JS. Sem isto o runtime falha com
# "Prisma Client could not locate the Query Engine for runtime debian-openssl-3.0.x".
# Copiamos o diretório gerado para um caminho fixo (o caminho real tem o hash de
# versão do pnpm, que não dá para escrever à mão de forma estável).
RUN PRISMA_CLIENT_DIR="$(dirname "$(find /app/node_modules/.pnpm -path '*/.prisma/client/index.js' | head -1)")" \
    && mkdir -p /prisma-runtime \
    && cp -r "$PRISMA_CLIENT_DIR"/. /prisma-runtime/ \
    && ls /prisma-runtime/libquery_engine-debian-openssl-3.0.x.so.node

# ─── Runtime: web ────────────────────────────────────────────────────────────
FROM base AS web
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs

# O standalone do Next em monorepo replica a árvore a partir da raiz do repo.
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
# public/ pode estar vazia — COPY tolerante (o . no fim evita erro se não houver arquivos)
COPY --from=build --chown=nextjs:nodejs /app/apps/web/public/ ./apps/web/public/

# Engine do Prisma + override explícito do caminho (ver nota no stage de build).
COPY --from=build --chown=nextjs:nodejs /prisma-runtime ./prisma-runtime
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/prisma-runtime/libquery_engine-debian-openssl-3.0.x.so.node

USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# ─── Runtime: worker ─────────────────────────────────────────────────────────
# Roda direto do fonte com tsx (sem passo de bundle): o worker é I/O-bound e o
# ganho de um bundler não compensa a complexidade.
FROM deps AS worker
ENV NODE_ENV=production
COPY . .
RUN pnpm -F @lotopro/db exec prisma generate
EXPOSE 3001
CMD ["pnpm", "-F", "@lotopro/worker", "exec", "tsx", "src/index.ts"]
