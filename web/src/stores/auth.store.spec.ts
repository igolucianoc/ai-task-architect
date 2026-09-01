import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ApiError } from '@/services/http-client';
import * as authService from '@/services/auth.service';
import { getAccessToken } from '@/services/auth-token-holder';
import { useAuthStore } from './auth.store';

// Mocka o service (não a rede). O http client é injetado nas actions.
vi.mock('@/services/auth.service');

const AUTH = {
  user: { id: 'u1', email: 'a@b.com', displayName: 'Alice' },
  accessToken: 'tok-123',
};

describe('auth.store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('login com sucesso popula user+token, status authenticated e sincroniza o holder', async () => {
    vi.mocked(authService.login).mockResolvedValue(AUTH);
    const store = useAuthStore();

    await store.login('a@b.com', 'pw');

    expect(store.user).toEqual(AUTH.user);
    expect(store.accessToken).toBe('tok-123');
    expect(store.isAuthenticated).toBe(true);
    expect(store.status).toBe('authenticated');
    expect(store.error).toBeNull();
    expect(getAccessToken()).toBe('tok-123');
  });

  it('login com falha (ApiError) seta error, status error e não autentica', async () => {
    vi.mocked(authService.login).mockRejectedValue(
      new ApiError(401, 'Credenciais inválidas', null),
    );
    const store = useAuthStore();

    await store.login('a@b.com', 'wrong');

    expect(store.isAuthenticated).toBe(false);
    expect(store.user).toBeNull();
    expect(store.status).toBe('error');
    expect(store.error).toBe('Credenciais inválidas');
  });

  it('register com sucesso popula a sessão', async () => {
    vi.mocked(authService.register).mockResolvedValue(AUTH);
    const store = useAuthStore();

    await store.register('a@b.com', 'pw', 'Alice');

    expect(store.isAuthenticated).toBe(true);
    expect(store.user).toEqual(AUTH.user);
    expect(store.status).toBe('authenticated');
  });

  it('logout limpa sessão e holder mesmo se o service falhar', async () => {
    vi.mocked(authService.login).mockResolvedValue(AUTH);
    vi.mocked(authService.logout).mockRejectedValue(new Error('rede caiu'));
    const store = useAuthStore();
    await store.login('a@b.com', 'pw');

    await store.logout();

    expect(store.isAuthenticated).toBe(false);
    expect(store.user).toBeNull();
    expect(store.accessToken).toBeNull();
    expect(store.status).toBe('idle');
    expect(getAccessToken()).toBeNull();
  });

  it('bootstrap com sucesso restaura sessão e marca initialized', async () => {
    vi.mocked(authService.refresh).mockResolvedValue(AUTH);
    const store = useAuthStore();

    await store.bootstrap();

    expect(store.isAuthenticated).toBe(true);
    expect(store.user).toEqual(AUTH.user);
    expect(store.initialized).toBe(true);
  });

  it('bootstrap com falha deixa deslogado e marca initialized', async () => {
    vi.mocked(authService.refresh).mockRejectedValue(new ApiError(401, 'sem sessão', null));
    const store = useAuthStore();

    await store.bootstrap();

    expect(store.isAuthenticated).toBe(false);
    expect(store.initialized).toBe(true);
    expect(store.status).toBe('idle');
  });

  it('bootstrap é idempotente: não chama refresh de novo se já inicializado', async () => {
    vi.mocked(authService.refresh).mockResolvedValue(AUTH);
    const store = useAuthStore();

    await store.bootstrap();
    await store.bootstrap();

    expect(authService.refresh).toHaveBeenCalledTimes(1);
  });
});
