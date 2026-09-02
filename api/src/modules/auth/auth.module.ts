import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthService } from './application/auth.service';
import { TokenService } from './application/token.service';
import { AuthController } from './presentation/auth.controller';
import { JwtStrategy } from './presentation/http/jwt.strategy';
import { REFRESH_SESSION_REPOSITORY } from './domain/refresh-session.repository';
import { PrismaRefreshSessionRepository } from './persistence/prisma-refresh-session.repository';

@Module({
  imports: [UsersModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    JwtStrategy,
    { provide: REFRESH_SESSION_REPOSITORY, useClass: PrismaRefreshSessionRepository },
  ],
  exports: [AuthService, TokenService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- módulo do NestJS
export class AuthModule {}
