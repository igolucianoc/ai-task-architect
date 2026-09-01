# ADR-005 — Server-Sent Events para streaming de geração

**Data:** 2026-09-01  
**Status:** Aceito

## Contexto

A geração de especificações pelo LLM pode levar de 5 a 30 segundos. Exibir o resultado apenas ao
final cria uma experiência de usuário ruim. Precisamos transmitir os tokens progressivamente.

Precisamos decidir entre WebSocket, SSE (Server-Sent Events) e long-polling.

## Decisão

Usar **Server-Sent Events (SSE)** via endpoint `GET /tasks/:id/stream`.

## Justificativa

- SSE é unidirecional (servidor → cliente), que é exatamente o padrão necessário: o cliente não
  envia dados durante o streaming, apenas recebe tokens.
- SSE usa HTTP padrão — sem upgrade de protocolo, sem negociação adicional, sem biblioteca no
  cliente (API `EventSource` nativa nos browsers modernos).
- NestJS tem suporte nativo via `@Sse()` decorator com `Observable<MessageEvent>`.
- Reconexão automática é comportamento padrão do `EventSource` — o browser reconecta se a conexão
  cair, com `Last-Event-ID` para retomada (implementaremos sem retomada nesta versão).
- Mais simples de depurar que WebSocket: os eventos são texto plano visíveis no DevTools.

## Protocolo definido

```
Evento: data
Dados: { "token": "...", "type": "token" }

Evento final: data
Dados: { "type": "done" }

Evento de erro: data
Dados: { "type": "error", "message": "..." }
```

O cliente fecha a conexão `EventSource` ao receber `type: "done"` ou `type: "error"`.

## Alternativas consideradas

| Opção | Motivo de descarte |
|-------|-------------------|
| WebSocket | Bidirecional — poder desnecessário; mais complexo de configurar e escalar |
| Long-polling | Latência maior, mais requisições, pior UX |
| Chunked HTTP response | Menos ergonômico que SSE; sem reconexão automática |

## Consequências

- O endpoint SSE é protegido por JWT — o cliente envia o token no header `Authorization` via
  `fetch` com `ReadableStream` (o `EventSource` nativo não suporta headers customizados).
  Alternativa: token curto na query string, descartado após uso.
- Timeout de 90 segundos na conexão; se o LLM não concluir neste tempo, o servidor emite
  `type: "error"` e fecha.
- O servidor faz cleanup do AsyncIterable do LLM ao detectar que o cliente desconectou
  (`req.on('close', ...)`) para não desperdiçar tokens da Hugging Face.
- Sem suporte a retomada de stream nesta versão (sem `Last-Event-ID`). Se a conexão cair, o
  cliente consulta `GET /tasks/:id` para ver se a tarefa já foi concluída.
