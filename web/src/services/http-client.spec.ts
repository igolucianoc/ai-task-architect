import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHttpClient, ApiError, type HttpClientHooks } from './http-client';

/** Cria uma Response JSON de sucesso. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Cria uma Response sem corpo (ex.: 204). */
function emptyResponse(status = 204): Response {
  return new Response(null, { status });
}

/** Hooks padrão com spies, permitindo sobrescrever o token retornado. */
function makeHooks(token: string | null = null): HttpClientHooks & {
  getAccessToken: ReturnType<typeof vi.fn>;
  onTokenRefreshed: ReturnType<typeof vi.fn>;
  onAuthError: ReturnType<typeof vi.fn>;
} {
  return {
    getAccessToken: vi.fn(() => token),
    onTokenRefreshed: vi.fn(),
    onAuthError: vi.fn(),
  };
}

describe('createHttpClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('deve fazer GET, parsear JSON e enviar credentials include', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createHttpClient(makeHooks());
    const result = await client.get<{ ok: boolean }>('/api/tasks');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/tasks');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
  });

  it('deve enviar Authorization quando há token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const client = createHttpClient(makeHooks('tok-123'));
    await client.get('/api/auth/me');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer tok-123');
  });

  it('não deve enviar Authorization quando não há token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const client = createHttpClient(makeHooks(null));
    await client.get('/api/tasks');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('deve fazer POST com body JSON e Content-Type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ taskId: 't1', status: 'queued' }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createHttpClient(makeHooks());
    const result = await client.post('/api/tasks', { description: 'desc' });

    expect(result).toEqual({ taskId: 't1', status: 'queued' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ description: 'desc' });
  });

  it('deve resolver void em respostas 204 sem corpo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyResponse(204));
    vi.stubGlobal('fetch', fetchMock);

    const client = createHttpClient(makeHooks());
    const result = await client.post<void>('/api/auth/logout');

    expect(result).toBeUndefined();
  });

  it('deve lançar ApiError com status e message (string) quando !ok', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ statusCode: 400, message: 'Email inválido', error: 'Bad Request' }, 400),
      );
    vi.stubGlobal('fetch', fetchMock);

    const client = createHttpClient(makeHooks());
    await expect(client.post('/api/auth/login', {})).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'Email inválido',
    });
  });

  it('deve normalizar message quando é array, juntando as partes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { statusCode: 400, message: ['campo A obrigatório', 'campo B inválido'] },
          400,
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const client = createHttpClient(makeHooks());
    const error = await client.get('/api/tasks').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe('campo A obrigatório, campo B inválido');
  });

  it('deve usar mensagem genérica de fallback quando não há message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'Server Error' }, 500));
    vi.stubGlobal('fetch', fetchMock);

    const client = createHttpClient(makeHooks());
    const error = await client.get('/api/tasks').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(500);
    expect((error as ApiError).message).toContain('500');
  });

  describe('refresh automático em 401', () => {
    it('deve renovar token, notificar e re-executar a request original com o novo Bearer', async () => {
      const hooks = makeHooks('old-token');
      // Simula o contrato real: onTokenRefreshed atualiza a fonte do token,
      // de modo que o retry (que lê getAccessToken no momento da chamada)
      // passe a enviar o novo Bearer.
      let currentToken = 'old-token';
      hooks.getAccessToken.mockImplementation(() => currentToken);
      hooks.onTokenRefreshed.mockImplementation((token: string) => {
        currentToken = token;
      });
      const fetchMock = vi
        .fn()
        // 1) request protegida original → 401
        .mockResolvedValueOnce(jsonResponse({ message: 'expirado' }, 401))
        // 2) POST /api/auth/refresh → 200 com novo token
        .mockResolvedValueOnce(jsonResponse({ accessToken: 'new-token' }))
        // 3) retry da request original → 200
        .mockResolvedValueOnce(jsonResponse({ id: 't1' }));
      vi.stubGlobal('fetch', fetchMock);

      const client = createHttpClient(hooks);
      const result = await client.get<{ id: string }>('/api/tasks/t1');

      expect(result).toEqual({ id: 't1' });
      expect(fetchMock).toHaveBeenCalledTimes(3);

      // 2ª chamada foi ao endpoint de refresh, sem body.
      const [refreshPath, refreshInit] = fetchMock.mock.calls[1];
      expect(refreshPath).toBe('/api/auth/refresh');
      expect(refreshInit.method).toBe('POST');
      expect(refreshInit.body).toBeUndefined();

      // Novo token propagado via hook.
      expect(hooks.onTokenRefreshed).toHaveBeenCalledWith('new-token');

      const [, retryInit] = fetchMock.mock.calls[2];
      expect(retryInit.headers.Authorization).toBe('Bearer new-token');

      expect(hooks.onAuthError).not.toHaveBeenCalled();
    });

    it('deve chamar onAuthError e propagar erro quando o refresh falha (sem loop)', async () => {
      const hooks = makeHooks('old-token');
      const fetchMock = vi
        .fn()
        // 1) request protegida original → 401
        .mockResolvedValueOnce(jsonResponse({ message: 'expirado' }, 401))
        // 2) POST /api/auth/refresh → 401 (cookie ausente/inválido)
        .mockResolvedValueOnce(jsonResponse({ message: 'sem sessão' }, 401));
      vi.stubGlobal('fetch', fetchMock);

      const client = createHttpClient(hooks);
      const error = await client.get('/api/tasks').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(401);
      expect(hooks.onAuthError).toHaveBeenCalledTimes(1);
      expect(hooks.onTokenRefreshed).not.toHaveBeenCalled();
      // Refresh chamado só uma vez: 2 chamadas totais (original + refresh), sem loop.
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('não deve tentar refresh quando skipAuthRefresh está setado (ex.: login com 401)', async () => {
      const hooks = makeHooks();
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ message: 'credencial inválida' }, 401));
      vi.stubGlobal('fetch', fetchMock);

      const client = createHttpClient(hooks);
      const error = await client
        .post('/api/auth/login', {}, { skipAuthRefresh: true })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(401);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(hooks.onAuthError).not.toHaveBeenCalled();
      expect(hooks.onTokenRefreshed).not.toHaveBeenCalled();
    });
  });
});
