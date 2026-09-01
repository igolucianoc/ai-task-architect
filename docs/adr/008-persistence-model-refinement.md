# ADR-008 — Refinamento do modelo de persistência

**Data:** 2026-09-01  
**Status:** Aceito  
**Substitui parcialmente:** o modelo de domínio inicial descrito na Etapa 01

## Contexto

O modelo de domínio inicial (Etapa 01) definiu quatro entidades: `User`, `Task`, `Evaluation` e
`RefreshToken`. Ao implementar a persistência, precisamos de mais granularidade para suportar
requisitos que o modelo simplificado não cobria:

- Retentativas de geração (uma tarefa pode ter mais de uma tentativa de geração).
- Observabilidade de consumo de tokens do LLM (custo e latência por chamada).
- Separação entre a solicitação (`Task`), a execução (`run`) e o resultado (`artifact`).

## Decisão

Refinar o modelo para sete entidades, mantendo a coerência com os fluxos definidos na Etapa 01:

| Entidade (Etapa 03) | Origem (Etapa 01) | Papel |
|---------------------|-------------------|-------|
| `User` | `User` | Usuário autenticado |
| `RefreshSession` | `RefreshToken` | Sessão de refresh (renomeada para refletir o conceito) |
| `Task` | `Task` | Agregado raiz: a solicitação do usuário |
| `TaskGenerationRun` | (novo) | Uma execução de geração via LLM — permite retry e histórico |
| `TaskArtifact` | parte de `Task.content` | O conteúdo gerado (spec Markdown), vinculado a uma run |
| `TaskEvaluation` | `Evaluation` | Avaliação de qualidade (LLM Judge) |
| `LlmUsage` | (novo) | Consumo de tokens por chamada ao LLM |

## Justificativa

- **`TaskGenerationRun` separada de `Task`:** uma tarefa pode falhar e ser retentada. Modelar a
  execução como entidade própria preserva o histórico de tentativas sem sobrescrever a tarefa.
- **`TaskArtifact` separado da run:** o conteúdo gerado é um resultado imutável. Separá-lo permite
  associá-lo a exatamente uma run bem-sucedida e mantém a `Task` enxuta.
- **`LlmUsage` como entidade dedicada:** consumo de tokens e latência são dados de observabilidade
  que alimentam a Etapa 09. Registrá-los por operação (geração/avaliação) permite análise de custo.
- **`RefreshSession` em vez de `RefreshToken`:** o nome comunica melhor que a entidade representa
  uma sessão renovável com user-agent e expiração, não apenas uma string de token.

## Estados (enums)

- `TaskStatus`: `PENDING | STREAMING | COMPLETED | FAILED`
- `GenerationRunStatus`: `RUNNING | SUCCEEDED | FAILED`
- `EvaluationStatus`: `PENDING | COMPLETED | UNAVAILABLE`
- `LlmOperation`: `GENERATION | EVALUATION`

## Consequências

- O contrato do domínio (Etapa 01) permanece válido no nível conceitual; a implementação apenas
  adiciona granularidade interna.
- Queries de histórico usam `Task` como raiz e carregam `artifacts`/`evaluation` conforme necessário.
- O `token` do refresh nunca é persistido em claro: guardamos `tokenHash` (ver Etapa 04).
- `score` usa `Decimal(4,2)` para precisão exata (evita erros de ponto flutuante na média).
- `dimensions` da avaliação é `Json` — flexível para a rubrica de cinco dimensões sem tabela extra.
- Deleção em cascata: remover um `User` remove suas tarefas, runs, artifacts e avaliações.
  `LlmUsage` usa `SetNull` para preservar dados de custo mesmo se a run/avaliação for removida.

## Trade-off aceito

Sete entidades é mais do que o mínimo absoluto (quatro), mas cada uma responde a um requisito
concreto (retry, observabilidade, imutabilidade do resultado). Não há entidade sem uso previsto
nas etapas seguintes. O modelo continua legível para um projeto de portfólio.
