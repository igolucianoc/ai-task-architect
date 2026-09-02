import { User as PrismaUser } from '@prisma/client';
import { UserEntity } from '../domain/user.entity';

/** Translates between the Prisma row shape and the domain entity. */
export const UserMapper = {
  toDomain(row: PrismaUser): UserEntity {
    return new UserEntity({
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      displayName: row.displayName,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  },
};
