import { randomUUID } from 'node:crypto';
import { UserEntity } from '../domain/user.entity';
import { CreateUserInput, IUserRepository } from '../domain/user.repository';

/**
 * In-memory implementation of {@link IUserRepository} for tests and offline runs.
 * Not intended for production use.
 */
export class InMemoryUserRepository implements IUserRepository {
  private readonly users = new Map<string, UserEntity>();

  findById(id: string): Promise<UserEntity | null> {
    return Promise.resolve(this.users.get(id) ?? null);
  }

  findByEmail(email: string): Promise<UserEntity | null> {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return Promise.resolve(user);
      }
    }
    return Promise.resolve(null);
  }

  create(input: CreateUserInput): Promise<UserEntity> {
    const now = new Date();
    const user = new UserEntity({
      id: randomUUID(),
      email: input.email,
      passwordHash: input.passwordHash,
      displayName: input.displayName,
      createdAt: now,
      updatedAt: now,
    });
    this.users.set(user.id, user);
    return Promise.resolve(user);
  }
}
