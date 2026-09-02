import { UserEntity } from './user.entity';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
}

/**
 * Domain-owned port for user persistence. Implementations live in the
 * persistence layer (Prisma for production, in-memory for tests).
 */
export interface IUserRepository {
  findById(id: string): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  create(input: CreateUserInput): Promise<UserEntity>;
}

/** Injection token for {@link IUserRepository}. */
export const USER_REPOSITORY = Symbol('IUserRepository');
