import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infra/database/prisma/prisma.service';
import { UserEntity } from '../domain/user.entity';
import { CreateUserInput, IUserRepository } from '../domain/user.repository';
import { UserMapper } from './user.mapper';

/** Prisma-backed implementation of {@link IUserRepository}. */
@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? UserMapper.toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? UserMapper.toDomain(row) : null;
  }

  async create(input: CreateUserInput): Promise<UserEntity> {
    const row = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        displayName: input.displayName,
      },
    });
    return UserMapper.toDomain(row);
  }
}
