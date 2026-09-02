import { RefreshSession as PrismaRefreshSession } from '@prisma/client';
import { RefreshSessionEntity } from '../domain/refresh-session.entity';

/** Translates between the Prisma row shape and the domain entity. */
export const RefreshSessionMapper = {
  toDomain(row: PrismaRefreshSession): RefreshSessionEntity {
    return new RefreshSessionEntity({
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      userAgent: row.userAgent,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
    });
  },
};
