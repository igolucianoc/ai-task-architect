import { Module } from '@nestjs/common';
import { UsersService } from './application/users.service';
import { USER_REPOSITORY } from './domain/user.repository';
import { PrismaUserRepository } from './persistence/prisma-user.repository';

@Module({
  providers: [UsersService, { provide: USER_REPOSITORY, useClass: PrismaUserRepository }],
  exports: [UsersService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- módulo do NestJS
export class UsersModule {}
