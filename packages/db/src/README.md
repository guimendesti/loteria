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

## Consistência com `@lotopro/core`

`packages/db` depende de `@lotopro/core` (link de workspace). `src/seed-data/types.ts` importa
`LotterySlug`/`ExtraFieldConfig`/`LotteryFormat` de lá em vez de duplicá-los — `@lotopro/core`
é o contrato canônico. `test/seed-consistency.test.ts` garante que os dados de
`src/seed-data/` (slugs, preço da aposta simples, universo/picks, faixas de premiação) não
divergem de `packages/core/src/lottery/configs.ts`; duas exceções estruturais (numeração de
`tier` da Dupla Sena e colapso de "1 ou 0 trevo" da +Milionária), forçadas por
`@@unique([lotteryId, tier])` no schema Prisma, estão documentadas no topo desse teste e em
`src/seed-data/prize-tiers.ts`.
