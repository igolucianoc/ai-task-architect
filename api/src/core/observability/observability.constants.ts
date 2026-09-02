/**
 * Constantes de observabilidade compartilhadas entre o ClsModule, o AppLogger,
 * o interceptor de logging HTTP e o filtro de exceções.
 *
 * Mantê-las centralizadas garante que o nome do header e a chave do CLS sejam
 * escritos e lidos exatamente da mesma forma em todos os pontos.
 */

/** Chave sob a qual o correlation id é armazenado no CLS (AsyncLocalStorage). */
export const CORRELATION_ID_KEY = 'correlationId';

/**
 * Nome do header HTTP usado tanto para reaproveitar um correlation id de entrada
 * quanto para devolvê-lo na resposta. Em minúsculas por ser como o Express expõe
 * os headers recebidos.
 */
export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Nomes de parâmetros de query cujo valor é sensível e NUNCA deve aparecer em
 * logs ou em respostas de erro. O caso concreto é o `token` da rota SSE
 * (`GET /tasks/:id/stream?token=<JWT>`), já que o `EventSource` nativo não envia
 * o header Authorization (ADR-005) e o access token acaba na URL.
 */
const SENSITIVE_QUERY_PARAMS: readonly string[] = ['token'];

/**
 * Remove valores sensíveis da query string de uma URL antes de logá-la ou
 * devolvê-la ao cliente, substituindo-os por `[REDACTED]`. Preserva o path e os
 * demais parâmetros. É defensiva: se a URL não puder ser parseada, faz um
 * fallback por regex; nunca lança.
 */
export function sanitizeUrlForLogging(url: string): string {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) {
    return url;
  }

  const path = url.slice(0, queryStart);
  const rawQuery = url.slice(queryStart + 1);

  try {
    const params = new URLSearchParams(rawQuery);
    let changed = false;
    for (const key of SENSITIVE_QUERY_PARAMS) {
      if (params.has(key)) {
        params.set(key, '[REDACTED]');
        changed = true;
      }
    }
    if (!changed) {
      return url;
    }
    // decodeURIComponent para não reescrever '[REDACTED]' como percent-encoded.
    return `${path}?${decodeURIComponent(params.toString())}`;
  } catch {
    // Fallback robusto: mascara `param=valor` de cada chave sensível.
    let masked = url;
    for (const key of SENSITIVE_QUERY_PARAMS) {
      masked = masked.replace(new RegExp(`([?&]${key}=)[^&]*`, 'gi'), `$1[REDACTED]`);
    }
    return masked;
  }
}
