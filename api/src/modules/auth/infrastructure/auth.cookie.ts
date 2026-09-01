import { CookieOptions, Response } from 'express';

export const REFRESH_COOKIE_NAME = 'refresh_token';

/**
 * Configuração do cookie de refresh token.
 * - httpOnly: inacessível via JavaScript (proteção contra XSS)
 * - secure: apenas HTTPS em produção
 * - sameSite strict: mitiga CSRF
 * - path restrito ao endpoint de auth
 */
export function buildRefreshCookieOptions(isProduction: boolean, ttlDays: number): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: ttlDays * 24 * 60 * 60 * 1000,
  };
}

export function setRefreshCookie(
  res: Response,
  token: string,
  isProduction: boolean,
  ttlDays: number,
): void {
  res.cookie(REFRESH_COOKIE_NAME, token, buildRefreshCookieOptions(isProduction, ttlDays));
}

export function clearRefreshCookie(res: Response, isProduction: boolean): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api/auth',
  });
}
