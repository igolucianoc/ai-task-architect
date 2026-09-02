# Senior/Staff Engineering Review — Etapa 12

**Data:** 2026-09-01
**Escopo:** revisão completa do backend (NestJS) e frontend (Vue 3) do AI Task Architect.

## Veredito geral

Projeto sólido e maduro. Tipagem estrita sem `any` em produção, arquitetura hexagonal
bem aplicada no domínio de LLM, segurança de autenticação acima da média (refresh token
opaco hasheado, rotação com detecção de reuse, dummy hash anti-enumeração), rate limiting
distribuído em Redis e SSE resiliente. **Nenhum BLOCKER.** Dois HIGH — ambos corrigidos
nesta etapa. Os demais itens são melhorias registradas para as próximas iterações.

## Classificação dos achados

### BLOCKER
Nenhum.

### HIGH (corrigidos nesta etapa)

- **H1 — Access token vazava nos logs pela query string do SSE.**
  `common/observability/http-logging.interceptor.ts` e `common/filters/global-exception.filter.ts`
  logavam a URL completa. A rota SSE `GET /api/tasks/:id/stream?token=<JWT>` carrega o access
  token na query (o `EventSource` não envia header Authorization — ADR-005), então o token ia
  para os logs, contrariando a promessa de nunca logá-lo. **Correção aplicada:** helper
  `sanitizeUrlForLogging` (em `observability.constants.ts`) mascara `token` como `[REDACTED]`
  antes de logar e antes de expor em `path` na resposta de erro. Ver ADR-013.

- **H2 — Seed produzia uma tarefa COMPLETED que renderizava vazia.**
  `prisma/seed.ts` gravava o artifact como Markdown (`contentFormat: 'markdown'`), mas a
  produção grava JSON; o presenter fazia `JSON.parse` e caía no `catch`, retornando
  `specification: null`. Além disso, `dimensions` usava chaves fora de `EVALUATION_CRITERIA`
  e sem o nível `scores`, então critérios e motivos saíam vazios. O `update` do upsert da
  avaliação também só sincronizava `status`, quebrando a idempotência real. **Correção
  aplicada:** artifact gravado como `JSON.stringify(<TaskSpecification>)` com
  `contentFormat: 'json'`; `dimensions = { scores: {6 critérios}, overallScore, reasons }`;
  `result`/`promptVersion` incluídos; `update` do upsert espelha o `create`. Validado por
  `GET /api/tasks/:id` retornando spec + avaliação preenchidas.

### MEDIUM (registrados, não aplicados)

- **M1** — `HuggingFaceProvider` não passa timeout/`AbortSignal` ao SDK; o `STREAM_TIMEOUT_MS`
  do controller encerra o stream mas não cancela a chamada HTTP, que segue pendurada.
- **M2** — `feather` (face de display) usado abaixo de 48px em ~11 seletores do frontend;
  o `DESIGN.md` reserva feather para ≥48px e manda usar duolingo-sans 700 em subtítulos.
- **M3** — `GenerationProgress.vue` usa `box-shadow` no keyframe do pulse; o `DESIGN.md` veta
  sombras. Substituir por `transform: scale`/`opacity`.
- **M4** — `ConfirmDialog.vue` sem focus trap e com Esc no backdrop (frágil); faltam prender o
  foco no modal e restaurá-lo ao acionador.
- **M5** — Cookie de refresh com `secure` derivado só de `NODE_ENV=production`; staging sob
  HTTPS não-"production" enviaria sem `Secure`.
- **M6** — `correlationId` não volta no header da resposta SSE (headers já enviados); poderia
  ir no payload dos eventos.

### LOW

- **L1** — Sem purge de `RefreshSession` expiradas/revogadas (tabela cresce).
- **L2** — Rotação de refresh não é transacional (revoke + issue separados).
- **L3** — Política de senha exige apenas mínimo de 8 caracteres.
- **L4** — `trust proxy` não configurado; throttle por IP fica impreciso atrás de proxy.
- **L5** — `parseArtifactContent` faz cast sem revalidar Zod (assimetria com o caminho do worker).
- **L6** — `AppConfig` como interseção manual alarga o literal `NODE_ENV`.

### NICE_TO_HAVE

- **N1** — `HF_MODEL_EVALUATION` configurado mas não usado (juiz usa o mesmo provider).
- **N2** — Cores hover/active do `BaseButton` hardcoded fora dos tokens.
- **N3** — Endpoint agregado de métricas de LLM (hoje só por-task).
- **N4** — Porta de repositório para simetria com a porta `LlmProvider`.

## Validações exigidas pelo Prompt 12

| Item | Resultado |
|------|-----------|
| Zero `any` | Confirmado (api + web, produção); `strict` ligado |
| Ausência de secrets no código | Confirmado (só via env/Zod; `.env` gitignored e não trackeado) |
| Refresh token não em texto puro | Confirmado (opaco 48 bytes, apenas SHA-256 no banco) |
| Rate limiting | Confirmado (throttler Redis + `@Throttle` nas rotas de auth) |
| SSE | Confirmado (ReplaySubject/defer, timeout, reemissão de estado terminal) |
| Seed | Corrigido (H2) e validado ponta a ponta via API |
| Frontend seguindo `DESIGN.md` | Parcial — divergências M2/M3 registradas |

## Verificação executada

- `typecheck`, `lint` e `test` (135 testes) verdes após as correções.
- Seed reexecutado; convergência confirmada por consulta ao Postgres.
- `GET /api/tasks/:id` autenticado retornou spec (título + 4 critérios de aceite) e avaliação
  (APPROVED, score 8.5, 6 critérios, 2 motivos).
- Log do SSE com token na query passou a exibir `token=[REDACTED]`.
