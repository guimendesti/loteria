# LotoPro — imagem multi-stage do monorepo pnpm.
# Alvos: `web` (Next.js standalone) e `worker` (BullMQ via tsx).
#   docker build --target web    -t lotopro-web .
#   docker build --target worker -t lotopro-worker .

# ─── Base ────────────────────────────────────────────────────────────────────
FROM node:20-slim AS base
# corepack falha com verificação de assinatura em alguns ambientes — npm é mais estável
RUN npm install -g pnpm@9.15.9
# node:20-slim (Debian) traz openssl e usa glibc — engines do Prisma mais estáveis
# que no Alpine/musl, e uma dependência de rede a menos no build.
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
RUN pnpm -F @lotopro/web build

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
