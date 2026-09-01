import { Injectable, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigType } from '@nestjs/config';
import { randomBytes, createHash } from 'node:crypto';
import { RefreshSession } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { appConfig } from '../config/app.config';

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

export interface IssuedRefreshToken {
  session: RefreshSession;
  rawToken: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
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

    const session = await this.prisma.refreshSession.create({
      data: { userId, tokenHash, userAgent: userAgent ?? null, expiresAt },
    });

    return { session, rawToken };
  }

  findSessionByRawToken(rawToken: string): Promise<RefreshSession | null> {
    return this.prisma.refreshSession.findUnique({
      where: { tokenHash: this.hashToken(rawToken) },
    });
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.refreshSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Detecção de reuse: se um refresh token já revogado é reapresentado,
   * revogamos todas as sessões ativas do usuário como medida defensiva.
   */
  async revokeAllSessionsForUser(userId: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  isSessionActive(session: RefreshSession): boolean {
    return session.revokedAt === null && session.expiresAt.getTime() > Date.now();
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
