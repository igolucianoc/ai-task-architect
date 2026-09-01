import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { User, RefreshSession } from '@prisma/client';
import { AuthService } from './auth.service';
import { UsersService } from '../../users/application/users.service';
import { TokenService } from './token.service';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'ana@example.com',
    passwordHash: 'hash',
    displayName: 'Ana',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeSession(overrides: Partial<RefreshSession> = {}): RefreshSession {
  return {
    id: 'session-1',
    userId: 'user-1',
    tokenHash: 'token-hash',
    userAgent: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let users: {
    findByEmail: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let tokens: {
    signAccessToken: ReturnType<typeof vi.fn>;
    issueRefreshToken: ReturnType<typeof vi.fn>;
    findSessionByRawToken: ReturnType<typeof vi.fn>;
    revokeSession: ReturnType<typeof vi.fn>;
    revokeAllSessionsForUser: ReturnType<typeof vi.fn>;
    isSessionActive: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    users = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
    };
    tokens = {
      signAccessToken: vi.fn().mockReturnValue('access-token'),
      issueRefreshToken: vi
        .fn()
        .mockResolvedValue({ session: makeSession(), rawToken: 'raw-refresh' }),
      findSessionByRawToken: vi.fn(),
      revokeSession: vi.fn().mockResolvedValue(undefined),
      revokeAllSessionsForUser: vi.fn().mockResolvedValue(undefined),
      isSessionActive: vi.fn(),
    };

    service = new AuthService(users as unknown as UsersService, tokens as unknown as TokenService);
  });

  describe('register', () => {
    it('cria usuário e retorna tokens no fluxo de sucesso', async () => {
      users.findByEmail.mockResolvedValue(null);
      users.create.mockResolvedValue(makeUser());

      const result = await service.register({
        email: 'ana@example.com',
        password: 'senhaForte1',
        displayName: 'Ana',
      });

      expect(users.create).toHaveBeenCalledOnce();
      expect(result.user.email).toBe('ana@example.com');
      expect(result.tokens.accessToken).toBe('access-token');
      expect(result.tokens.refreshToken).toBe('raw-refresh');
      // Nunca deve vazar o hash da senha
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('rejeita e-mail já cadastrado com mensagem genérica', async () => {
      users.findByEmail.mockResolvedValue(makeUser());

      await expect(
        service.register({ email: 'ana@example.com', password: 'senhaForte1', displayName: 'Ana' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(users.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('autentica com credenciais válidas', async () => {
      const user = makeUser({ passwordHash: await bcrypt.hash('senhaForte1', 4) });
      users.findByEmail.mockResolvedValue(user);

      const result = await service.login({ email: 'ana@example.com', password: 'senhaForte1' });

      expect(result.tokens.accessToken).toBe('access-token');
    });

    it('rejeita senha incorreta', async () => {
      const user = makeUser({ passwordHash: await bcrypt.hash('senhaCerta1', 4) });
      users.findByEmail.mockResolvedValue(user);

      await expect(
        service.login({ email: 'ana@example.com', password: 'senhaErrada' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejeita e-mail inexistente com a mesma exceção de senha inválida (anti-enumeração)', async () => {
      users.findByEmail.mockResolvedValue(null);

      // Mesma exceção genérica de credenciais inválidas, sem revelar que o e-mail não existe
      await expect(
        service.login({ email: 'naoexiste@example.com', password: 'qualquer' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(tokens.issueRefreshToken).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('rotaciona o token no fluxo de sucesso', async () => {
      const session = makeSession();
      tokens.findSessionByRawToken.mockResolvedValue(session);
      tokens.isSessionActive.mockReturnValue(true);
      users.findById.mockResolvedValue(makeUser());

      const result = await service.refresh('raw-refresh');

      // Revoga a sessão antiga (rotação) e emite novo par
      expect(tokens.revokeSession).toHaveBeenCalledWith(session.id);
      expect(tokens.issueRefreshToken).toHaveBeenCalledOnce();
      expect(result.tokens.accessToken).toBe('access-token');
    });

    it('rejeita token desconhecido', async () => {
      tokens.findSessionByRawToken.mockResolvedValue(null);

      await expect(service.refresh('inexistente')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('detecta reuse: token revogado revoga todas as sessões do usuário', async () => {
      const revoked = makeSession({ revokedAt: new Date() });
      tokens.findSessionByRawToken.mockResolvedValue(revoked);
      tokens.isSessionActive.mockReturnValue(false);

      await expect(service.refresh('raw-refresh')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(tokens.revokeAllSessionsForUser).toHaveBeenCalledWith(revoked.userId);
    });
  });

  describe('logout', () => {
    it('revoga a sessão ativa', async () => {
      const session = makeSession();
      tokens.findSessionByRawToken.mockResolvedValue(session);
      tokens.isSessionActive.mockReturnValue(true);

      await service.logout('raw-refresh');

      expect(tokens.revokeSession).toHaveBeenCalledWith(session.id);
    });

    it('é idempotente para token inexistente', async () => {
      tokens.findSessionByRawToken.mockResolvedValue(null);

      await expect(service.logout('inexistente')).resolves.toBeUndefined();
      expect(tokens.revokeSession).not.toHaveBeenCalled();
    });
  });
});
