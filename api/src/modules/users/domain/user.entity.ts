export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
}

export interface UserProps {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Domain entity for an application user.
 *
 * Wraps the persisted user data and exposes behavior (such as producing a
 * public projection) without leaking the persistence framework into the domain.
 */
export class UserEntity {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: UserProps) {
    this.id = props.id;
    this.email = props.email;
    this.passwordHash = props.passwordHash;
    this.displayName = props.displayName;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /** Projection safe to expose outside the trust boundary (no password hash). */
  toPublicUser(): PublicUser {
    return { id: this.id, email: this.email, displayName: this.displayName };
  }
}
