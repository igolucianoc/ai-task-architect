import { Module } from '@nestjs/common';
import { UsersService } from './application/users.service';

@Module({
  providers: [UsersService],
  exports: [UsersService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- módulo do NestJS
export class UsersModule {}
