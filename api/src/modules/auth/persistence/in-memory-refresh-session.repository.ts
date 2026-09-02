import { randomUUID } from 'node:crypto';
import { RefreshSessionEntity } from '../domain/refresh-session.entity';
import {
  CreateRefreshSessionInput,
  IRefreshSessionRepository,
} from '../domain/refresh-session.repository';

/**
 * In-memory implementation of {@link IRefreshSessionRepository} for tests and
 * offline runs. Not intended for production use.
 */
export class InMemoryRefreshSessionRepository implements IRefreshSessionRepository {
  private readonly sessions = new Map<string, RefreshSessionEntity>();

  create(input: CreateRefreshSessionInput): Promise<RefreshSessionEntity> {
    const session = new RefreshSessionEntity({
      id: randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      userAgent: input.userAgent,
      expiresAt: input.expiresAt,
      revokedAt: null,
      createdAt: new Date(),
    });
    this.sessions.set(session.id, session);
    return Promise.resolve(session);
  }

  findByTokenHash(tokenHash: string): Promise<RefreshSessionEntity | null> {
    for (const session of this.sessions.values()) {
      if (session.tokenHash === tokenHash) {
        return Promise.resolve(session);
      }
    }
    return Promise.resolve(null);
  }

  revokeById(sessionId: string, revokedAt: Date): Promise<void> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      this.sessions.set(sessionId, this.withRevokedAt(existing, revokedAt));
    }
    return Promise.resolve();
  }

  revokeAllActiveForUser(userId: string, revokedAt: Date): Promise<void> {
    for (const [id, session] of this.sessions) {
      if (session.userId === userId && session.revokedAt === null) {
        this.sessions.set(id, this.withRevokedAt(session, revokedAt));
      }
    }
    return Promise.resolve();
  }

  private withRevokedAt(session: RefreshSessionEntity, revokedAt: Date): RefreshSessionEntity {
    return new RefreshSessionEntity({
      id: session.id,
      userId: session.userId,
      tokenHash: session.tokenHash,
      userAgent: session.userAgent,
      expiresAt: session.expiresAt,
      revokedAt,
      createdAt: session.createdAt,
    });
  }
}
