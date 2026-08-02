# @lotopro/db

Schema Prisma, cliente e seeds do LotoPro. Ver [docs/07-modelo-de-dados.md](../../../docs/07-modelo-de-dados.md)
para o modelo completo — este pacote é uma transcrição fiel dele, não redesenha nada.

## Pré-requisito: `DATABASE_URL`

Crie um `.env` neste pacote (`packages/db/.env`, já ignorado pelo `.gitignore` da raiz) com:

```
DATABASE_URL="postgresql://usuario:senha@host:5432/lotopro"
```

## Comandos

```bash
# Gera o Prisma Client em node_modules/.prisma/client a partir de prisma/schema.prisma
pnpm -F @lotopro/db generate

# Cria/atualiza as tabelas no banco a partir do schema (dev — sem migrations versionadas ainda)
pnpm -F @lotopro/db exec prisma db push

# Ou, quando o time decidir versionar migrations (recomendado antes de produção):
pnpm -F @lotopro/db exec prisma migrate dev --name init

# Popula tenant "platform", os 4 planos, as 11 modalidades, price_tiers e prize_tiers.
# Idempotente — pode rodar quantas vezes for preciso.
pnpm -F @lotopro/db seed

# Valida e formata o schema (não requer conexão real com o banco)
pnpm -F @lotopro/db exec prisma validate
pnpm -F @lotopro/db exec prisma format
```

## O que o seed popula

| Fonte | Conteúdo |
|---|---|
| `src/seed.ts` | tenant `platform` |
| `src/seed-data/plans.ts` | planos `free`, `premium`, `pro`, `whitelabel` com `entitlements` (docs/05 §5.2) |
| `src/seed-data/lotteries.ts` | as 11 modalidades, com `drawSchedule`/`colorToken` (docs/09 §9.2) |
| `src/seed-data/price-tiers.ts` | preço da aposta simples de cada modalidade, vigente desde 2025-07-01 |
| `src/seed-data/prize-tiers.ts` | faixas de premiação das 9 modalidades de dezenas do MVP (Loteca/Federal ficam para a Fase 2 — ver docs/12 Q9) |

`contests` (histórico de concursos) e `closure_matrices` (biblioteca de fechamentos) **não** são
seeds — são jobs/backfills separados (ver docs/07 §7.11 e docs/06).

## Notas de ambiente desta sessão

- `packages/db` ainda não depende de `@lotopro/core` (sem link de workspace configurado). Os
  tipos em `src/seed-data/types.ts` espelham manualmente o contrato de `packages/core/src/types.ts`
  — mantenha os dois em sincronia até o link ser criado.
- `@types/node` foi adicionado a `devDependencies` e resolvido manualmente com um link para o
  pacote já presente no store do pnpm (`node_modules/.pnpm/@types+node@20.19.43`), sem rodar
  `pnpm install`, para que `tsc` reconheça `process`/`console` no `seed.ts`. Rode `pnpm install`
  na raiz quando puder, para que o pnpm gerencie esse link normalmente e o lockfile fique em dia.
