# Prompt 06 — Streaming via SSE

Adicione streaming para acompanhar uma geração de tarefa.

## Objetivo

O frontend deve conseguir acompanhar eventos como:

- started;
- analyzing_context;
- generating_requirements;
- generating_acceptance_criteria;
- evaluating;
- completed;
- failed.

Use Server-Sent Events.

Não use WebSocket.

## Arquitetura

Não coloque processamento pesado dentro de uma conexão HTTP longa sem necessidade.

Se a execução assíncrona com BullMQ/worker for adotada, use o job para processamento e SSE para transportar eventos ao cliente.

## Contrato

Defina tipos explícitos para os eventos SSE.

Inclua:

- event name;
- payload;
- timestamp quando útil;
- correlation/run id.

O cliente deve tratar:

- reconexão;
- encerramento;
- erro;
- conclusão.

Teste o contrato e o fluxo principal.
