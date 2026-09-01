import { describe, it, expect, vi } from 'vitest';
import type { HttpClient } from './http-client';
import { register, login, refresh, logout, fetchMe, type AuthResponse } from './auth.service';

/** Cria um http client mockado com get/post/request spies. */
function makeClient(): HttpClient & {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn(),
    post: vi.fn(),
    request: vi.fn(),
  };
}

const AUTH_OPTIONS = { skipAuthRefresh: true };

const authResponse: AuthResponse = {
  user: { id: 'u1', email: 'a@b.com', displayName: 'Alice' },
  accessToken: 'tok',
};

describe('auth.service', () => {
  it('register deve chamar POST /api/auth/register com body e skipAuthRefresh', async () => {
    const client = makeClient();
    client.post.mockResolvedValue(authResponse);

    const input = { email: 'a@b.com', password: 'pw', displayName: 'Alice' };
    const result = await register(client, input);

    expect(client.post).toHaveBeenCalledWith('/api/auth/register', input, AUTH_OPTIONS);
    expect(result).toEqual(authResponse);
  });

  it('login deve chamar POST /api/auth/login com body e skipAuthRefresh', async () => {
    const client = makeClient();
    client.post.mockResolvedValue(authResponse);

    const input = { email: 'a@b.com', password: 'pw' };
    const result = await login(client, input);

    expect(client.post).toHaveBeenCalledWith('/api/auth/login', input, AUTH_OPTIONS);
    expect(result).toEqual(authResponse);
  });

  it('refresh deve chamar POST /api/auth/refresh sem body e com skipAuthRefresh', async () => {
    const client = makeClient();
    client.post.mockResolvedValue(authResponse);

    const result = await refresh(client);

    expect(client.post).toHaveBeenCalledWith('/api/auth/refresh', undefined, AUTH_OPTIONS);
    expect(result).toEqual(authResponse);
  });

  it('logout deve chamar POST /api/auth/logout sem body e com skipAuthRefresh', async () => {
    const client = makeClient();
    client.post.mockResolvedValue(undefined);

    await logout(client);

    expect(client.post).toHaveBeenCalledWith('/api/auth/logout', undefined, AUTH_OPTIONS);
  });

  it('fetchMe deve chamar GET /api/auth/me e retornar o usuário', async () => {
    const client = makeClient();
    const user = { id: 'u1', email: 'a@b.com', displayName: 'Alice' };
    client.get.mockResolvedValue(user);

    const result = await fetchMe(client);

    expect(client.get).toHaveBeenCalledWith('/api/auth/me');
    expect(result).toEqual(user);
  });
});
