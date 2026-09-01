# ADR-006 — BullMQ para processamento assíncrono de avaliações

**Data:** 2026-09-01  
**Status:** Aceito

## Contexto

Após a geração da especificação, o sistema precisa executar uma segunda chamada ao LLM para
avaliar a qualidade do resultado (LLM Judge). Essa avaliação:

- Não deve bloquear a resposta principal ao usuário.
- Pode falhar sem impactar a experiência de geração.
- Deve ser retentada em caso de falha transiente (timeout, rate limit).

Precisamos decidir como executar esse processamento assíncrono.

## Decisão

Usar **BullMQ** com Redis como backend de fila para processar avaliações de forma assíncrona.

## Justificativa

- BullMQ é o sucessor do Bull, bem mantido e com tipagem TypeScript nativa.
- `@nestjs/bullmq` oferece integração com o sistema de módulos e DI do NestJS sem boilerplate.
- Redis já estará no ambiente (necessário para outros fins potenciais); reutilizar para filas
  não adiciona nova infraestrutura.
- Retentativas com backoff exponencial são configuração declarativa em BullMQ.
- Permite observar o estado dos jobs (aguardando, processando, concluído, falhou) via
  `bull-board` ou logs — útil para demonstrar observabilidade.

## Configuração da fila

```typescript
// Fila: 'evaluation'
// Concorrência: 2 workers (respeitar rate limits do HF)
// Tentativas: 3
// Backoff: exponential, delay inicial 2000ms
// Remove on complete: 100 jobs retidos (diagnóstico)
// Remove on fail: 200 jobs retidos (diagnóstico)
```

## Alternativas consideradas

| Opção | Motivo de descarte |
|-------|-------------------|
| Processamento síncrono pós-geração | Atrasa a resposta ao usuário; falha do Judge afeta a geração |
| `setImmediate` / Promise desanexada | Sem retry, sem persistência, sem visibilidade de falhas |
| Agenda.js (MongoDB) | Requer MongoDB; Redis já está na stack |
| pg-boss (PostgreSQL) | Válido, mas adiciona lógica de polling ao Postgres; BullMQ é mais ergonômico |

## Consequências

- Redis é obrigatório no ambiente de desenvolvimento e produção.
- O `EvaluationWorker` é um `@Processor('evaluation')` NestJS que herda a DI do módulo.
- Falha definitiva (após 3 tentativas): `Evaluation.status` é setado para `unavailable`.
- Não há fila para a geração principal — ela é síncrona no ciclo SSE para manter a simplicidade.
- Jobs de avaliação são enfileirados apenas para tarefas com `status = completed`; tarefas
  `failed` não geram avaliação.
