import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { RefreshSession } from '@prisma/client';
import { TokenService } from './token.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AppConfig } from '../config/app.config';

function makeSession(overrides: Partial<RefreshSession> = {}): RefreshSession {
  return {
    id: 'session-1',
    userId: 'user-1',
    tokenHash: 'hash',
    userAgent: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('TokenService', () => {
  let service: TokenService;
  let jwt: { sign: ReturnType<typeof vi.fn> };
  let prisma: {
    refreshSession: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
  };

  const config = {
    jwtSecret: 'segredo-de-teste-com-mais-de-32-caracteres!',
    jwtAccessExpiresIn: '15m',
    refreshTokenTtlDays: 7,
  } as unknown as AppConfig;

  beforeEach(() => {
    jwt = { sign: vi.fn().mockReturnValue('signed-jwt') };
    prisma = {
      refreshSession: {
        create: vi
          .fn()
          .mockImplementation(({ data }: { data: Partial<RefreshSession> }) =>
            Promise.resolve(makeSession(data)),
          ),
        findUnique: vi.fn(),
      },
    };

    service = new TokenService(
      jwt as unknown as JwtService,
      prisma as unknown as PrismaService,
      config,
    );
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
    const { rawToken } = await service.issueRefreshToken('user-1', 'jest-agent');

    expect(rawToken).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
    const createArg = prisma.refreshSession.create.mock.calls[0][0] as {
      data: { tokenHash: string };
    };
    // O valor persistido nunca é o token em claro
    expect(createArg.data.tokenHash).not.toBe(rawToken);
    expect(createArg.data.tokenHash).toHaveLength(64); // sha256 hex
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
