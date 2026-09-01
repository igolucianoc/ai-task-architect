// Funções de acesso a dados para autenticação. Sem estado local: apenas
// chamam os endpoints de `/api/auth` via o http client injetado.
// O estado (token em memória, usuário atual) é responsabilidade da store.

import type { HttpClient } from './http-client';

/** Usuário autenticado, conforme retornado pelo backend. */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

/** Resposta comum de register/login/refresh: usuário + token de acesso. */
export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

/** Entrada de registro. */
export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

/** Entrada de login. */
export interface LoginInput {
  email: string;
  password: string;
}

/**
 * As rotas de auth usam `skipAuthRefresh: true`: um 401 aqui significa
 * credencial/sessão inválida, não token de acesso expirado. Interceptar
 * refresh nelas causaria recursão (o próprio refresh é uma rota de auth).
 */
const AUTH_OPTIONS = { skipAuthRefresh: true } as const;

/** Registra um novo usuário. */
export function register(client: HttpClient, input: RegisterInput): Promise<AuthResponse> {
  return client.post<AuthResponse>('/api/auth/register', input, AUTH_OPTIONS);
}

/** Autentica um usuário existente. */
export function login(client: HttpClient, input: LoginInput): Promise<AuthResponse> {
  return client.post<AuthResponse>('/api/auth/login', input, AUTH_OPTIONS);
}

/** Renova a sessão a partir do cookie httpOnly (sem body). */
export function refresh(client: HttpClient): Promise<AuthResponse> {
  return client.post<AuthResponse>('/api/auth/refresh', undefined, AUTH_OPTIONS);
}

/** Encerra a sessão (invalida o refresh token no backend). */
export function logout(client: HttpClient): Promise<void> {
  return client.post<void>('/api/auth/logout', undefined, AUTH_OPTIONS);
}

/** Busca o usuário autenticado atual (rota protegida). */
export function fetchMe(client: HttpClient): Promise<AuthUser> {
  return client.get<AuthUser>('/api/auth/me');
}
