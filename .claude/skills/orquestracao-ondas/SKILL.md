---
name: orquestracao-ondas
description: Protocolo para orquestrar implementação com múltiplos subagentes em paralelo, sem conflito e sem perder trabalho quando um agente morre. Use ao coordenar vários subagentes numa mesma base de código, ao dividir trabalho entre modelos (Opus/Sonnet/Haiku) por custo-qualidade, ou ao planejar sessões longas com risco de estourar limite. Comprovado em 4 sessões, 20+ agentes, recuperação 5/5.
---

# Orquestração em ondas

Protocolo para dirigir muitos subagentes numa mesma base de código. Validado em 4 sessões
(20+ agentes, ~260 arquivos, 555 testes), com **5 de 5 recuperações** de agentes mortos.

## Os quatro princípios

1. **Um agente = um território disjunto.** Território é um diretório, não uma "área temática".
   Dois agentes nunca editam o mesmo arquivo.
2. **Contratos antes de paralelizar.** O orquestrador escreve os tipos/interfaces compartilhados
   *antes* de lançar a onda, e os congela. Sem contrato, os agentes divergem.
3. **O orquestrador é dono da costura.** Lockfile, schema do banco, arquivos de registro
   (`_app.ts`, `index.ts` de pacote), wiring e commits são exclusivos dele.
4. **Commit por onda.** Se a sessão morrer no meio, o trabalho commitado está salvo e o
   working tree preserva o resto.

---

## Anatomia de uma onda

```
1. Orquestrador escreve/congela contratos             (inline, 5–15 min)
2. Cria pacotes/deps novos + roda install UMA vez     (evita corrida no lockfile)
3. Lança N agentes em paralelo, territórios disjuntos (1 mensagem, N tool calls)
4. Checkpoint: costura + typecheck/test raiz          (inline)
5. Commit da onda + atualiza o arquivo de estado
```

**Nunca** deixe um subagente rodar `pnpm install`/`add`. Se a onda precisa de dependência nova,
o orquestrador declara e instala **antes** de lançar.

## Território: como escrever no prompt

```
SEU TERRITÓRIO: `packages/core/src/entitlements/**` e `packages/core/test/entitlements.test.ts`.
NÃO toque em: mais nada do core (outro agente edita lottery/checking AGORA),
`src/index.ts` (costura do orquestrador — deixe a linha de export no relatório).
```

Quando dois agentes precisam do mesmo arquivo de registro: **um é o dono**, os outros entregam
a linha exata no relatório final e o orquestrador aplica no checkpoint.

## Contrato compartilhado entre agentes que não se veem

Quando o agente A implementa um cliente e o agente B o consome **em paralelo**, escreva a
**assinatura pública exata no prompt dos dois**, idêntica. Funcionou sem uma única divergência:

```
⚠️ CONTRATO PÚBLICO EXATO (outro agente está consumindo isto em paralelo):
export class AsaasClient {
  createSubscription(input: { customerId: string; valueCents: bigint; ... }): Promise<{id: string}>
  ...
}
```

Peça ao consumidor que isole o import num **composition root** único — assim, se o produtor
atrasar, só um arquivo fica vermelho.

---

## Escolha de modelo por demanda

| Demanda | Modelo | Effort |
|---|---|---|
| Arquitetura, modelagem de dados, contratos | Opus | `xhigh` |
| Algoritmos (combinatória, rateio, cálculo financeiro) | Opus | `max` |
| Segurança, criptografia, pagamento, RBAC | Opus | `xhigh` |
| Code review de código crítico | Opus | `xhigh` |
| **Implementação padrão (CRUD, telas, routers, integrações)** | **Sonnet** | `high` |
| Testes, refactors mecânicos | Sonnet | `medium` |
| Renomear, seeds, i18n, formatação, docs drift | Haiku | — |
| Runtime: extração estruturada (OCR, classificação) | Haiku | — |

Distribuição observada num projeto real: **~31% Opus · ~63% Sonnet · ~6% Haiku**.
Custo de API acaba sendo desprezível frente ao tempo de desenvolvimento — otimize
para **contexto enxuto** (que melhora a qualidade), não para economia em reais.

### Quando NÃO usar Opus

Se a tarefa é "implementar a tela X conforme a especificação Y", Sonnet entrega igual por
uma fração do custo. Opus rende onde **errar custa caro e o erro é difícil de detectar**:
dinheiro, segurança, matemática, contratos que outros dependem.

---

## Recuperação de agente morto

Agentes morrem por watchdog (sem progresso) ou por limite de sessão. **O trabalho fica no disco.**

1. **Inspecione o disco primeiro** (`find`/`git status`) — descubra o que já existe.
2. **Retome com `SendMessage`**, com lista cirúrgica do que falta:

```
Você foi morto pelo limite de sessão e está sendo retomado.
Estado no disco: A, B e C existem; você parou no meio de D.
FALTA: (1) terminar D; (2) criar E; (3) rodar `pnpm -F pkg typecheck && test` até verde.
Seja DIRETO: não re-leia o que está pronto, exceto D.
Relatório final curto: o que fez nesta retomada, resultados, pendências.
```

Nunca relance o agente do zero — ele refaz trabalho e pode conflitar com o que já está lá.

---

## Checkpoint (obrigatório entre ondas)

```bash
pnpm -r typecheck >/dev/null 2>&1; echo "TC=$?"
pnpm -r test      >/dev/null 2>&1; echo "TEST=$?"
```
Use **exit code**, não grep na saída — saída colorida/com NUL engana o parser.

Depois: aplicar as costuras dos relatórios → commit → atualizar o arquivo de estado.

## Arquivo de estado (o que torna a compactação segura)

Mantenha um `ORQUESTRACAO.md` no repositório com:

- **Protocolo** (para a sessão seguinte não reinventar)
- **O que existe e funciona** (tabela por área)
- **Pendências numeradas, com dono e sessão** — a fila de trabalho
- **Roteiro da próxima sessão**, com o *prompt de retomada pronto para colar*
- **Registro de decisões** já tomadas (para não serem re-litigadas)
- **Bugs de produção corrigidos** e por que não apareceram em dev

Isso substitui a memória de contexto: qualquer sessão nova lê o arquivo e continua.

---

## Sinais de que a orquestração está indo bem

- Relatórios de agentes trazem **decisões justificadas** e divergências explicitadas, não só
  "arquivos criados".
- Um agente encontra bug no trabalho de outro (ex.: teste de consistência entre seed e domínio
  pegou 11 divergências reais).
- Agentes recusam suposições e vão verificar (ex.: sondar a API real antes de escrever o parser).

## Armadilhas

| Armadilha | Prevenção |
|---|---|
| Dois agentes no mesmo arquivo | Território por diretório; dono único para arquivos de registro |
| Corrida no lockfile | Só o orquestrador instala |
| Agente "conserta" o contrato | Declare o contrato como **congelado** no prompt |
| Onda grande demais estoura a sessão | Commit por onda; ondas de 3–4 agentes; checkpoint entre elas |
| Verificar com grep na saída de teste | Use exit code |
| Smoke script que não reproduz produção | Smoke deve usar a **mesma cadeia** do bootstrap |
