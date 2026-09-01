// Store de autenticação (setup store). Centraliza o estado de sessão:
// usuário atual, access token (em memória) e o ciclo de vida do login.
//
// A store não importa o router: navegação é responsabilidade do
// componente/guard. O access token é sincronizado com o "token holder"
// (auth-token-holder) para que o http client consiga lê-lo sem acoplamento.

import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { ApiError } from '@/services/http-client';
import { httpClient } from '@/services/http-client-instance';
import { setAccessToken, registerAuthErrorHandler } from '@/services/auth-token-holder';
import { login as loginService, register as registerService } from '@/services/auth.service';
import { logout as logoutService, refresh as refreshService } from '@/services/auth.service';
import type { AuthUser } from '@/services/auth.service';

/** Estados possíveis do fluxo de autenticação. */
export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'error';

/** Extrai uma mensagem legível de um erro desconhecido. */
function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Ocorreu um erro inesperado.';
}

export const useAuthStore = defineStore('auth', () => {
  // --- Estado ---
  const user = ref<AuthUser | null>(null);
  const accessToken = ref<string | null>(null);
  const status = ref<AuthStatus>('idle');
  const error = ref<string | null>(null);
  /** Indica se o bootstrap de sessão (refresh silencioso) já rodou. */
  const initialized = ref<boolean>(false);

  // --- Getters ---
  const isAuthenticated = computed(() => user.value !== null && accessToken.value !== null);
  const isLoading = computed(() => status.value === 'loading');

  // --- Helpers internos ---

  /**
   * Centraliza a escrita da sessão: atualiza estado da store E o token holder,
   * garantindo que o http client sempre enxergue o token atual.
   */
  function setSession(nextUser: AuthUser, token: string): void {
    user.value = nextUser;
    accessToken.value = token;
    setAccessToken(token);
    status.value = 'authenticated';
    error.value = null;
  }

  /** Limpa a sessão (estado + holder). Marca como deslogado (idle). */
  function clearSession(): void {
    user.value = null;
    accessToken.value = null;
    setAccessToken(null);
    status.value = 'idle';
  }

  // Registra a limpeza de sessão como handler de erro de auth do http client.
  // Assim, quando o refresh automático falha, a store reflete o logout.
  registerAuthErrorHandler(() => {
    clearSession();
  });

  // --- Actions ---

  /**
   * Autentica com email/senha. Em sucesso, popula a sessão. Em falha,
   * registra a mensagem em `error` e status `error` (não relança: o
   * componente lê `error`/`isAuthenticated`).
   */
  async function login(email: string, password: string): Promise<void> {
    status.value = 'loading';
    error.value = null;
    try {
      const response = await loginService(httpClient, { email, password });
      setSession(response.user, response.accessToken);
    } catch (err) {
      error.value = toErrorMessage(err);
      status.value = 'error';
    }
  }

  /** Registra um novo usuário e já inicia a sessão. Mesmo padrão de `login`. */
  async function register(email: string, password: string, displayName: string): Promise<void> {
    status.value = 'loading';
    error.value = null;
    try {
      const response = await registerService(httpClient, { email, password, displayName });
      setSession(response.user, response.accessToken);
    } catch (err) {
      error.value = toErrorMessage(err);
      status.value = 'error';
    }
  }

  /**
   * Encerra a sessão. Ignora erros de rede do logout (a sessão local é
   * limpa de qualquer forma).
   */
  async function logout(): Promise<void> {
    status.value = 'loading';
    try {
      await logoutService(httpClient);
    } catch {
      // Erro de rede no logout é ignorado: a sessão local será limpa mesmo assim.
    } finally {
      clearSession();
    }
  }

  /**
   * Tenta restaurar a sessão a partir do cookie de refresh (httpOnly), uma
   * única vez. Idempotente: se já inicializado, não refaz. Em sucesso popula
   * a sessão; em falha permanece deslogado. Sempre marca `initialized`.
   */
  async function bootstrap(): Promise<void> {
    if (initialized.value) {
      return;
    }
    status.value = 'loading';
    try {
      const response = await refreshService(httpClient);
      setSession(response.user, response.accessToken);
    } catch {
      // Sem sessão restaurável: segue deslogado (sem marcar como erro).
      clearSession();
    } finally {
      initialized.value = true;
    }
  }

  return {
    // estado
    user,
    accessToken,
    status,
    error,
    initialized,
    // getters
    isAuthenticated,
    isLoading,
    // actions
    login,
    register,
    logout,
    bootstrap,
    setSession,
  };
});
