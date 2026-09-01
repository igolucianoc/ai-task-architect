// Cliente HTTP baseado em `fetch` nativo para consumir a API (prefixo `/api`).
// Desacoplado da store de autenticação: recebe callbacks (hooks) para obter o
// token de acesso, reagir a uma renovação bem-sucedida e sinalizar erro de auth.
// Isso evita ciclo de importação (store -> service -> store).

/** Rota de renovação do token de acesso. */
const REFRESH_PATH = '/api/auth/refresh';

/**
 * Erro de API normalizado. Carrega o `status` HTTP, uma `message` legível e o
 * corpo cru da resposta (quando disponível) para inspeção adicional.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Callbacks injetados no client para lidar com o ciclo de vida do token de
 * acesso sem acoplar o client à store.
 */
export interface HttpClientHooks {
  /** Retorna o token de acesso atual (em memória) ou `null` se não houver. */
  getAccessToken: () => string | null;
  /** Chamado após uma renovação bem-sucedida, com o novo token. */
  onTokenRefreshed: (token: string) => void;
  /** Chamado quando a renovação falha (sessão expirada/ausente). */
  onAuthError: () => void;
}

/** Opções aceitas por `request` e helpers. */
export interface RequestOptions {
  /** Método HTTP. Padrão: `GET`. */
  method?: string;
  /** Corpo a serializar como JSON. Quando presente, define `Content-Type`. */
  body?: unknown;
  /**
   * Quando `true`, desabilita o interceptor de refresh automático em 401.
   * Usado por rotas de auth (login/register/refresh/logout), onde um 401 não
   * significa sessão expirada e um retry recursivo causaria loop.
   */
  skipAuthRefresh?: boolean;
}

/** API pública do client. */
export interface HttpClient {
  request: <T>(path: string, options?: RequestOptions) => Promise<T>;
  get: <T>(path: string, options?: RequestOptions) => Promise<T>;
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => Promise<T>;
}

/** Checa se um valor é um objeto simples (não nulo, não array). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normaliza a mensagem de erro a partir do corpo do backend
 * (GlobalExceptionFilter): `message` pode ser string, array de strings ou
 * estar ausente. Fallback genérico usa o status.
 */
function normalizeErrorMessage(body: unknown, status: number): string {
  if (isRecord(body)) {
    const message = body.message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
    if (Array.isArray(message)) {
      const parts = message.filter((item): item is string => typeof item === 'string');
      if (parts.length > 0) {
        return parts.join(', ');
      }
    }
  }
  return `Erro na requisição (HTTP ${status}).`;
}

/**
 * Lê o corpo da resposta como JSON de forma tolerante. Retorna `undefined`
 * quando não há corpo (ex.: 204) ou quando o parse falha.
 */
async function readJsonBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }
  const text = await response.text();
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Cria um client HTTP configurado com os hooks de autenticação.
 *
 * Assinatura pública:
 *   createHttpClient(hooks): HttpClient
 *   client.request<T>(path, options?): Promise<T>
 *   client.get<T>(path, options?): Promise<T>
 *   client.post<T>(path, body?, options?): Promise<T>
 */
export function createHttpClient(hooks: HttpClientHooks): HttpClient {
  /**
   * Executa uma única chamada HTTP (sem lógica de refresh). Monta headers,
   * envia credenciais e serializa/parseia JSON. Lança `ApiError` se `!ok`.
   */
  async function execute<T>(path: string, options: RequestOptions): Promise<T> {
    const headers: Record<string, string> = {};
    const token = hooks.getAccessToken();
    if (token !== null) {
      headers.Authorization = `Bearer ${token}`;
    }

    const hasBody = options.body !== undefined;
    if (hasBody) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(path, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers,
      ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
    });

    if (!response.ok) {
      const body = await readJsonBody(response);
      throw new ApiError(response.status, normalizeErrorMessage(body, response.status), body);
    }

    const data = await readJsonBody(response);
    return data as T;
  }

  /**
   * Tenta renovar o token uma única vez via `POST /api/auth/refresh`
   * (sem body, credentials include, sem interceptor de refresh). Retorna o
   * novo token em caso de sucesso ou lança o erro do refresh.
   */
  async function refreshAccessToken(): Promise<string> {
    const result = await execute<{ accessToken: string }>(REFRESH_PATH, {
      method: 'POST',
      skipAuthRefresh: true,
    });
    return result.accessToken;
  }

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    try {
      return await execute<T>(path, options);
    } catch (error) {
      // Só intercepta 401 em rotas protegidas (skipAuthRefresh !== true).
      // A própria chamada de refresh e o retry usam skipAuthRefresh, então
      // um 401 ali não re-dispara o fluxo — evitando loop infinito.
      const isAuthExpired =
        error instanceof ApiError && error.status === 401 && options.skipAuthRefresh !== true;

      if (!isAuthExpired) {
        throw error;
      }

      let newToken: string;
      try {
        newToken = await refreshAccessToken();
      } catch (refreshError) {
        hooks.onAuthError();
        throw refreshError;
      }

      hooks.onTokenRefreshed(newToken);

      // Re-executa a request original UMA vez, marcada para não disparar
      // refresh novamente (blindagem extra contra loop).
      return execute<T>(path, { ...options, skipAuthRefresh: true });
    }
  }

  function get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return request<T>(path, { ...options, method: 'GET' });
  }

  function post<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return request<T>(path, { ...options, method: 'POST', body });
  }

  return { request, get, post };
}
