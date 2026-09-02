export interface RefreshSessionProps {
  id: string;
  userId: string;
  tokenHash: string;
  userAgent: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

/**
 * Domain entity representing a refresh-token session.
 *
 * Encapsulates the rule that decides whether a session may still be used:
 * a session is active only while it is neither revoked nor expired.
 */
export class RefreshSessionEntity {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly userAgent: string | null;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;

  constructor(props: RefreshSessionProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.tokenHash = props.tokenHash;
    this.userAgent = props.userAgent;
    this.expiresAt = props.expiresAt;
    this.revokedAt = props.revokedAt;
    this.createdAt = props.createdAt;
  }

  /** A session is usable only while it is neither revoked nor expired. */
  isActive(now: Date = new Date()): boolean {
    return this.revokedAt === null && this.expiresAt.getTime() > now.getTime();
  }
}
