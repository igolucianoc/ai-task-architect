import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infra/database/prisma/prisma.service';
import { RefreshSessionEntity } from '../domain/refresh-session.entity';
import {
  CreateRefreshSessionInput,
  IRefreshSessionRepository,
} from '../domain/refresh-session.repository';
import { RefreshSessionMapper } from './refresh-session.mapper';

/** Prisma-backed implementation of {@link IRefreshSessionRepository}. */
@Injectable()
export class PrismaRefreshSessionRepository implements IRefreshSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateRefreshSessionInput): Promise<RefreshSessionEntity> {
    const row = await this.prisma.refreshSession.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        userAgent: input.userAgent,
        expiresAt: input.expiresAt,
      },
    });
    return RefreshSessionMapper.toDomain(row);
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshSessionEntity | null> {
    const row = await this.prisma.refreshSession.findUnique({ where: { tokenHash } });
    return row ? RefreshSessionMapper.toDomain(row) : null;
  }

  async revokeById(sessionId: string, revokedAt: Date): Promise<void> {
    await this.prisma.refreshSession.update({
      where: { id: sessionId },
      data: { revokedAt },
    });
  }

  async revokeAllActiveForUser(userId: string, revokedAt: Date): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt },
    });
  }
}
