// "Token holder" em nível de módulo: guarda o access token em memória e um
// callback opcional de "erro de auth".
//
// Solução anti-ciclo de import:
//   - A auth store escreve o token e registra o callback aqui (store -> holder).
//   - O http-client-instance apenas LÊ daqui (http-client-instance -> holder).
// Nenhum dos dois importa o outro, então não há ciclo:
//   store  ─┐
//           ├─▶ auth-token-holder ◀─ http-client-instance
//   (a store nunca importa o http-client-instance; o instance nunca importa a store)

/** Token de acesso atual, mantido apenas em memória (some no reload). */
let accessToken: string | null = null;

/** Callback disparado quando a renovação falha (sessão expirada/ausente). */
let authErrorHandler: (() => void) | null = null;

/** Retorna o token de acesso atual ou `null`. */
export function getAccessToken(): string | null {
  return accessToken;
}

/** Define (ou limpa, com `null`) o token de acesso atual. */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * Registra o handler de erro de auth (normalmente a limpeza de sessão da store).
 * Substitui qualquer handler anterior.
 */
export function registerAuthErrorHandler(handler: () => void): void {
  authErrorHandler = handler;
}

/** Dispara o handler de erro de auth, se houver. */
export function notifyAuthError(): void {
  authErrorHandler?.();
}
