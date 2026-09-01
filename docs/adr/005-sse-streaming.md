# ADR-005 — Server-Sent Events para streaming de geração

**Data:** 2026-09-01  
**Status:** Aceito

**Atualizado:** 2026-09-01 (Etapa 06) — protocolo, autenticação e fluxo revistos para refletir a
implementação. Ver "Nota de evolução" ao final.

## Contexto

A geração de especificações pelo LLM leva alguns segundos. Exibir o resultado apenas ao final cria
uma experiência de usuário ruim. Precisamos transmitir o **progresso** da geração ao cliente.

Precisamos decidir entre WebSocket, SSE (Server-Sent Events) e long-polling.

## Decisão

Usar **Server-Sent Events (SSE)** via endpoint `GET /tasks/:id/stream`.

O fluxo separa **criar** de **gerar** (fluxo "B1"):

1. `POST /tasks` apenas cria a tarefa com status `PENDING` e retorna `{ taskId }`. Não gera nada.
2. `GET /tasks/:id/stream` dispara a geração e transmite os eventos de progresso via SSE.

Assim não há processamento pesado preso numa conexão HTTP longa antes de o cliente se conectar, e o
cliente acompanha a geração desde o início.

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

Em vez de transmitir tokens do LLM, transmitimos **eventos de progresso de fase**, nomeados. Cada
evento SSE usa o campo `event` com o nome e `data` com o JSON do evento. Todo evento carrega um
`runId` (correlação da execução) e um `timestamp` ISO 8601.

Nomes de evento:

| Evento | Tipo | Payload adicional |
|--------|------|-------------------|
| `started` | progresso | `message?` |
| `analyzing_context` | progresso | `message?` |
| `generating_requirements` | progresso | `message?` |
| `generating_acceptance_criteria` | progresso | `message?` |
| `evaluating` | progresso | `message?` |
| `completed` | terminal | `taskId`, `specification` |
| `failed` | terminal | `taskId`, `error` |

Exemplo de frames SSE:

```
event: started
data: {"event":"started","runId":"<uuid>","timestamp":"2026-09-01T22:14:11.683Z"}

event: completed
data: {"event":"completed","runId":"<uuid>","taskId":"<uuid>","specification":{...},"timestamp":"..."}
```

O cliente fecha a conexão `EventSource` ao receber um evento terminal (`completed` ou `failed`).

Nota: como a geração é uma única chamada ao LLM (não há fases reais no provider),
`generating_requirements` e `generating_acceptance_criteria` são **marcos de progresso** para
feedback ao usuário, não fases distintas do modelo.

O contrato de eventos é tipado no backend (`application/task-generation-events.ts`) e espelhado no
frontend (`services/task-events.ts`), com parse defensivo do payload em ambos os lados.

## Alternativas consideradas

| Opção | Motivo de descarte |
|-------|-------------------|
| WebSocket | Bidirecional — poder desnecessário; mais complexo de configurar e escalar |
| Long-polling | Latência maior, mais requisições, pior UX |
| Chunked HTTP response | Menos ergonômico que SSE; sem reconexão automática |

## Consequências

- **Autenticação por query string.** O guard JWT global libera a rota (`@Public`) e a autenticação
  é feita manualmente no handler, validando o access token recebido em `?token=...`. Isso porque o
  `EventSource` nativo não envia o header `Authorization`. O token nunca é logado.
- **Autorização por dono.** A tarefa é carregada com escopo do usuário do token; tarefa de outro
  usuário (ou inexistente) resulta em 404.
- **Seleção por estado**, para não regenerar:
  - `PENDING` → dispara a geração e emite os eventos em tempo real;
  - `COMPLETED` → reemite um único `completed` com a especificação reidratada do artifact;
  - `FAILED` → reemite `failed` com o erro registrado;
  - `STREAMING` → emite `failed` ("geração já em andamento"), sem disparar outra geração.
- Timeout de 90 segundos; se estourar, o servidor emite `failed` (error `timeout`) e encerra.
- No servidor, a emissão usa um `Subject` RxJS entregue como `Observable<MessageEvent>` ao `@Sse()`;
  o encerramento é idempotente e o timer é limpo ao desconectar.
- Sem suporte a retomada de stream (sem `Last-Event-ID`). Se a conexão cair, o cliente consulta
  `GET /tasks/:id` para ver se a tarefa já foi concluída.

## Limitações conhecidas

- A chamada ao LLM **não é cancelável**: se o cliente desconectar no meio, o stream é encerrado, mas
  a geração em andamento segue até concluir e é persistida normalmente.
- Não há **lock de concorrência**: duas aberturas simultâneas do stream de uma mesma tarefa `PENDING`
  poderiam, em tese, iniciar duas runs. Um lock/fila resolverá isso na etapa de processamento
  assíncrono (BullMQ, Etapa 07).

## Nota de evolução

O protocolo planejado nesta ADR (Etapa 01) previa streaming de **tokens** do LLM
(`type: token|done|error`) com o token de auth no header via `fetch`+`ReadableStream`. Na
implementação (Etapa 06) optou-se por streaming de **eventos de progresso de fase** nomeados —
mais informativo para a UI e independente de o provider suportar streaming de tokens — e pela
autenticação via query string, compatível com o `EventSource` nativo. A decisão de usar SSE (e não
WebSocket) permanece.
