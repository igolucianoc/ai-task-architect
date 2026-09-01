# ADR-010 — LLM-as-Judge e Quality Gate

**Data:** 2026-09-01  
**Status:** Aceito  
**Relaciona-se com:** ADR-004 (Hugging Face), ADR-006 (BullMQ), ADR-008 (modelo de persistência),
ADR-009 (arquitetura hexagonal da geração)

## Contexto

Depois de gerar uma especificação, o sistema precisa avaliá-la de forma independente para reduzir a
confiança cega na saída do LLM. O prompt 07 pede: validar a estrutura, enviar o artefato a um
avaliador, receber critérios e scores, calcular um resultado e decidir um Quality Gate
(`APPROVED`/`REJECTED`), persistindo critérios, scores, justificativa, modelo, versão do prompt,
tokens, latência e o resultado final. O avaliador (judge) deve ser um componente independente do
gerador, sem reaproveitar o contexto de geração de forma enviesada.

## Decisão

Adicionar um **LLM-as-Judge** que roda de forma **assíncrona** após a geração, com um **Quality
Gate** objetivo e documentado.

### Critérios e escala

Seis critérios objetivos, cada um pontuado por um inteiro de **0 a 10**:

| Critério | O que mede |
|----------|-----------|
| `clarity` | Clareza e ausência de ambiguidade |
| `completeness` | Cobertura dos aspectos necessários |
| `consistency` | Coerência interna, sem contradições |
| `testability` | Critérios verificáveis e mensuráveis |
| `risks` | Identificação e tratamento de riscos |
| `requirementsAdherence` | Aderência à necessidade original (critério crítico) |

`overallScore` = média dos seis, arredondada a 2 casas.

### Regra do Quality Gate

`REJECTED` se **qualquer** condição for verdadeira; caso contrário, `APPROVED`:

1. `overallScore` < **7.0** (limiar de aprovação);
2. `requirementsAdherence` < **5** (piso do critério crítico);
3. qualquer critério = **0**.

Quando `REJECTED`, uma lista `reasons` (pt-BR) explica os motivos. Os limiares são constantes
exportadas (`APPROVAL_THRESHOLD`, `ADHERENCE_FLOOR`) — objetivos e testáveis.

### Independência do gerador

O prompt do judge (`buildJudgeMessages`) recebe **apenas** a necessidade original do usuário e a
especificação gerada (como JSON). Ele **não** reaproveita o system prompt nem as instruções de
geração — o módulo do judge sequer importa o `prompt-builder` do gerador. Isso é verificado por
teste (um trecho característico do prompt de geração não pode aparecer no prompt do judge). A
avaliação usa `temperature: 0` para ser o mais determinística possível.

### Saída não confiável

A resposta do judge é validada por `parseJudgeResponse` (Zod): extrai o JSON de eventual cerca
markdown, valida faixa (0–10 inteiro) dos seis critérios e a justificativa, e **nunca lança**. Se a
saída for inválida ou o provider falhar, a avaliação é persistida como `UNAVAILABLE` — **sem
derrubar** o resultado da geração, que já foi entregue ao usuário.

### Processamento assíncrono (BullMQ)

A avaliação roda em um **worker BullMQ** (fila `evaluation`), enfileirado quando a geração emite o
evento `completed`. O `jobId` é determinístico (= `taskId`), evitando avaliações duplicadas se o
stream for reaberto. Retentativas: 3 tentativas com backoff exponencial (ADR-006). Como a avaliação
é assíncrona e ocorre depois que o stream SSE encerrou, o cliente obtém o resultado consultando
`GET /tasks/:id` — não há evento SSE de avaliação.

### Persistência

`TaskEvaluation` (uma por tarefa, upsert idempotente) guarda: `status`
(`PENDING`/`COMPLETED`/`UNAVAILABLE`), `result` (`APPROVED`/`REJECTED`), `score` (Decimal), `rationale`,
`dimensions` (Json com scores por critério + reasons), `model`, `promptVersion` (`judge-v1`). Tokens e
latência do judge vão para `LlmUsage` com `operation = EVALUATION`.

## Alternativas consideradas

| Opção | Motivo de descarte |
|-------|-------------------|
| Avaliação síncrona no fluxo de geração | Bloquearia o usuário por mais uma chamada de LLM; contraria o ADR-006 |
| Judge multi-modelo / ensemble | Complexidade injustificada nesta etapa (o próprio prompt 07 pede para não fazer) |
| Reutilizar o contexto de geração no judge | Enviesa a avaliação; fere o requisito de independência |
| Gate puramente por média | Uma spec com aderência baixa mas média alta passaria; por isso o piso do critério crítico |

## Consequências

- O provider de LLM do judge é, por ora, o **mesmo** injetado para a geração (um único
  `LLM_PROVIDER`). Há um `HF_MODEL_EVALUATION` opcional na config, mas ainda não é usado por um
  provider dedicado — registrado como TODO na factory. Trocar exige um provider parametrizado.
- No modo de desenvolvimento sem token real, o `FakeLlmProvider` detecta se o prompt é de judge
  (pede scores/rationale) e responde um JSON de avaliação — permitindo demonstrar o Quality Gate
  offline, ponta a ponta.
- Sem lock de concorrência forte além do `jobId` determinístico; para a escala do projeto é
  suficiente.

## Trade-off aceito

Os limiares (7.0 e piso 5) são um ponto de partida razoável e explícito, não uma verdade absoluta.
São constantes centralizadas e fáceis de ajustar. O importante é que o gate seja **objetivo,
documentado e testável** — e não um julgamento opaco do modelo.
