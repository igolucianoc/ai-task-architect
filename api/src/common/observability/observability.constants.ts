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
