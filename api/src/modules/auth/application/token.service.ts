import { Injectable, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigType } from '@nestjs/config';
import { randomBytes, createHash } from 'node:crypto';
import { appConfig } from '../../../core/config/app.config';
import { RefreshSessionEntity } from '../domain/refresh-session.entity';
import {
  IRefreshSessionRepository,
  REFRESH_SESSION_REPOSITORY,
} from '../domain/refresh-session.repository';

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

export interface IssuedRefreshToken {
  session: RefreshSessionEntity;
  rawToken: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(REFRESH_SESSION_REPOSITORY)
    private readonly sessions: IRefreshSessionRepository,
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  signAccessToken(payload: AccessTokenPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.jwtSecret,
      expiresIn: this.config.jwtAccessExpiresIn,
    });
  }

  /**
   * Gera um refresh token opaco (não-JWT). Apenas o hash SHA-256 é persistido;
   * o valor em claro é entregue ao cliente uma única vez.
   */
  async issueRefreshToken(userId: string, userAgent?: string): Promise<IssuedRefreshToken> {
    const rawToken = randomBytes(48).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + this.config.refreshTokenTtlDays * 24 * 60 * 60 * 1000);

    const session = await this.sessions.create({
      userId,
      tokenHash,
      userAgent: userAgent ?? null,
      expiresAt,
    });

    return { session, rawToken };
  }

  findSessionByRawToken(rawToken: string): Promise<RefreshSessionEntity | null> {
    return this.sessions.findByTokenHash(this.hashToken(rawToken));
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.sessions.revokeById(sessionId, new Date());
  }

  /**
   * Detecção de reuse: se um refresh token já revogado é reapresentado,
   * revogamos todas as sessões ativas do usuário como medida defensiva.
   */
  async revokeAllSessionsForUser(userId: string): Promise<void> {
    await this.sessions.revokeAllActiveForUser(userId, new Date());
  }

  isSessionActive(session: RefreshSessionEntity): boolean {
    return session.isActive();
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
