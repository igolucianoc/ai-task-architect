# ADR-013 — Sanitização de parâmetros sensíveis em logs e respostas de erro

**Data:** 2026-09-01
**Status:** Aceito
**Relaciona-se com:** ADR-005 (SSE), ADR-011 (observabilidade)

## Contexto

O `EventSource` nativo do navegador não envia o header `Authorization`, então a rota de
streaming autentica pelo access token na query string: `GET /api/tasks/:id/stream?token=<JWT>`
(ADR-005). Na revisão Staff da Etapa 12 identificou-se que o `HttpLoggingInterceptor`
(`common/observability/http-logging.interceptor.ts`) e o `GlobalExceptionFilter`
(`common/filters/global-exception.filter.ts`) logavam a URL completa (`request.originalUrl` /
`request.url`) e o filtro ainda expunha essa URL no campo `path` da resposta de erro.

Consequência: o access token era gravado em texto puro nos logs estruturados, contrariando a
promessa explícita de "nunca logar o token" e criando um vetor real de vazamento de credencial.

## Decisão

Introduzir um helper puro `sanitizeUrlForLogging(url)` em
`common/observability/observability.constants.ts` que substitui o valor de parâmetros de query
sensíveis (`SENSITIVE_QUERY_PARAMS`, hoje `token`) por `[REDACTED]`, preservando path e demais
parâmetros. O helper é defensivo: usa `URLSearchParams` e, em falha de parse, faz fallback por
regex; nunca lança.

Aplicado em ambos os pontos de log/exposição:
- `HttpLoggingInterceptor`: a URL logada passa por `sanitizeUrlForLogging`.
- `GlobalExceptionFilter`: tanto o `path` devolvido ao cliente quanto a linha de log usam a URL
  sanitizada.

## Consequências

- O access token do SSE deixa de aparecer em logs de aplicação e no corpo de erro. Confirmado:
  o log passou a registrar `.../stream?token=[REDACTED]`.
- Novos parâmetros sensíveis podem ser cobertos adicionando-os a `SENSITIVE_QUERY_PARAMS`.
- A mitigação cobre os logs da própria aplicação. Logs de borda (nginx/proxy/CDN) ainda podem
  registrar a query string — permanece a recomendação de, no futuro, usar um token de stream
  dedicado de curta duração ou cookie httpOnly para o SSE (registrado como melhoria MEDIUM).
