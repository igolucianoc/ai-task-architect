import { RefreshSessionEntity } from './refresh-session.entity';

export interface CreateRefreshSessionInput {
  userId: string;
  tokenHash: string;
  userAgent: string | null;
  expiresAt: Date;
}

/**
 * Domain-owned port for refresh-session persistence. Implementations live in
 * the persistence layer (Prisma for production, in-memory for tests).
 */
export interface IRefreshSessionRepository {
  create(input: CreateRefreshSessionInput): Promise<RefreshSessionEntity>;
  findByTokenHash(tokenHash: string): Promise<RefreshSessionEntity | null>;
  revokeById(sessionId: string, revokedAt: Date): Promise<void>;
  revokeAllActiveForUser(userId: string, revokedAt: Date): Promise<void>;
}

/** Injection token for {@link IRefreshSessionRepository}. */
export const REFRESH_SESSION_REPOSITORY = Symbol('IRefreshSessionRepository');
