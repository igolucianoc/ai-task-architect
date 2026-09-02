import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';
import { RefreshSessionEntity } from '../domain/refresh-session.entity';
import { InMemoryRefreshSessionRepository } from '../persistence/in-memory-refresh-session.repository';
import type { AppConfig } from '../../../core/config/app.config';

function makeSession(
  overrides: Partial<ConstructorParameters<typeof RefreshSessionEntity>[0]> = {},
): RefreshSessionEntity {
  return new RefreshSessionEntity({
    id: 'session-1',
    userId: 'user-1',
    tokenHash: 'hash',
    userAgent: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  });
}

describe('TokenService', () => {
  let service: TokenService;
  let jwt: { sign: ReturnType<typeof vi.fn> };
  let sessions: InMemoryRefreshSessionRepository;

  const config = {
    jwtSecret: 'segredo-de-teste-com-mais-de-32-caracteres!',
    jwtAccessExpiresIn: '15m',
    refreshTokenTtlDays: 7,
  } as unknown as AppConfig;

  beforeEach(() => {
    jwt = { sign: vi.fn().mockReturnValue('signed-jwt') };
    sessions = new InMemoryRefreshSessionRepository();

    service = new TokenService(jwt as unknown as JwtService, sessions, config);
  });

  it('assina access token com secret e expiração da config', () => {
    const token = service.signAccessToken({ sub: 'user-1', email: 'ana@example.com' });

    expect(token).toBe('signed-jwt');
    expect(jwt.sign).toHaveBeenCalledWith(
      { sub: 'user-1', email: 'ana@example.com' },
      { secret: config.jwtSecret, expiresIn: '15m' },
    );
  });

  it('emite refresh token opaco e persiste apenas o hash', async () => {
    const createSpy = vi.spyOn(sessions, 'create');
    const { rawToken } = await service.issueRefreshToken('user-1', 'jest-agent');

    expect(rawToken).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
    const createArg = createSpy.mock.calls[0][0];
    // O valor persistido nunca é o token em claro
    expect(createArg.tokenHash).not.toBe(rawToken);
    expect(createArg.tokenHash).toHaveLength(64); // sha256 hex
  });

  it('recupera a sessão pelo token em claro via hash', async () => {
    const { rawToken } = await service.issueRefreshToken('user-1');

    const found = await service.findSessionByRawToken(rawToken);
    expect(found).not.toBeNull();
    expect(found?.userId).toBe('user-1');

    // Token diferente não resolve para a mesma sessão
    expect(await service.findSessionByRawToken('outro-token')).toBeNull();
  });

  it('considera sessão ativa quando não revogada e não expirada', () => {
    expect(service.isSessionActive(makeSession())).toBe(true);
  });

  it('considera sessão inativa quando revogada', () => {
    expect(service.isSessionActive(makeSession({ revokedAt: new Date() }))).toBe(false);
  });

  it('considera sessão inativa quando expirada', () => {
    expect(service.isSessionActive(makeSession({ expiresAt: new Date(Date.now() - 1000) }))).toBe(
      false,
    );
  });
});
