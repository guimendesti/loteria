# Deploy — LotoPro em VPS com Traefik compartilhado

Alvo: **https://loteria.iauai.online** (DNS já aponta para `76.13.172.16`).

---

## 0. Pré-requisito bloqueante: acesso SSH

O deploy automatizado está **bloqueado por credencial**. Estado verificado em 02/08/2026:

| Verificação | Resultado |
|---|---|
| DNS `loteria.iauai.online` | ✅ resolve para `76.13.172.16` |
| Porta 22 do servidor | ✅ aberta e aceitando conexão |
| Métodos oferecidos pelo servidor | `publickey,password` |
| Senha de `C:\var\www\.vps_pass` como `root` | ❌ **recusada** |
| Chaves locais (`id_ed25519`, `grindpoker_vps`) | ❌ recusadas |

**Para destravar, uma das opções:**

1. **Corrigir a senha** em `C:\var\www\.vps_pass` (se mudou), ou
2. **Instalar a chave pública** desta máquina no servidor:
   ```
   # chave pública local:
   cat ~/.ssh/id_ed25519.pub
   # no servidor:
   echo "<conteúdo>" >> /root/.ssh/authorized_keys
   ```
3. Informar o **usuário correto** (se não for `root`) ou a **porta** (se não for 22).

Após destravar: `bash deploy/deploy.sh` faz tudo.

---

## 1. Confirmar a configuração do Traefik na VPS

O compose usa variáveis para não chutar a convenção do servidor. Descubra os valores:

```bash
# nome da rede do Traefik
docker network ls

# nome do certresolver e dos entrypoints
docker inspect $(docker ps --filter name=traefik -q) \
  | grep -iE "certificatesresolvers|entrypoints" | head -20
# ou, se o Traefik usa arquivo estático:
docker exec $(docker ps --filter name=traefik -q) cat /etc/traefik/traefik.yml 2>/dev/null
```

Anote e coloque no `.env` do servidor (passo 2):

| Variável | Padrão assumido | Valor real |
|---|---|---|
| `TRAEFIK_NETWORK` | `traefik` | ? |
| `TRAEFIK_CERTRESOLVER` | `letsencrypt` | ? |
| `TRAEFIK_ENTRYPOINT` | `websecure` | ? |
| `TRAEFIK_ENTRYPOINT_HTTP` | `web` | ? |

---

## 2. Provisionar no servidor

```bash
ssh root@76.13.172.16
mkdir -p /opt/lotopro && cd /opt/lotopro
git clone git@github.com:guimendesti/loteria.git .
# (ou HTTPS, se a VPS não tiver deploy key)

cat > .env <<'EOF'
DOMAIN=loteria.iauai.online

POSTGRES_USER=lotopro
POSTGRES_PASSWORD=<GERAR: openssl rand -base64 24>
POSTGRES_DB=lotopro
DATABASE_URL=postgresql://lotopro:<MESMA_SENHA>@postgres:5432/lotopro
REDIS_URL=redis://redis:6379

BETTER_AUTH_SECRET=<GERAR: openssl rand -base64 32>

# Traefik — confirmar no passo 1
TRAEFIK_NETWORK=traefik
TRAEFIK_CERTRESOLVER=letsencrypt
TRAEFIK_ENTRYPOINT=websecure
TRAEFIK_ENTRYPOINT_HTTP=web

# Push (gerar: node -e "console.log(require('web-push').generateVAPIDKeys())")
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:contato@iauai.online

# Opcionais — sem eles o app sobe, mas billing/e-mail ficam inativos
RESEND_API_KEY=
EMAIL_FROM=LotoPro <nao-responda@loteria.iauai.online>
ASAAS_API_KEY=
ASAAS_WEBHOOK_TOKEN=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
EOF

chmod 600 .env
docker compose -f docker-compose.prod.yml up -d --build
```

O serviço `migrate` roda `prisma migrate deploy` + `seed` e só então `web` e `worker` sobem.

---

## 3. Verificar

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f web worker

# certificado (após ~30s do primeiro request)
curl -sI https://loteria.iauai.online | head -5
echo | openssl s_client -connect loteria.iauai.online:443 -servername loteria.iauai.online 2>/dev/null \
  | openssl x509 -noout -issuer -dates
```

**Carregar o histórico de concursos** (opcional, ~7h com throttle):
```bash
docker compose -f docker-compose.prod.yml exec worker \
  pnpm -F @lotopro/worker exec tsx src/scripts/smoke-sync.ts   # só os últimos (rápido)
```

---

## 4. Atualizar depois

```bash
cd /opt/lotopro && git pull
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Notas de arquitetura do deploy

- **Postgres e Redis são internos** (rede `internal`, sem porta publicada). Só o `web` fica
  na rede do Traefik.
- **O worker não é exposto** — o healthcheck (3001) só responde na rede interna.
- **`output: 'standalone'`** no Next reduz a imagem: só `server.js` + deps traçadas.
- **Migrations rodam como serviço one-shot**, com `service_completed_successfully` — nunca
  há web servindo contra schema desatualizado.
