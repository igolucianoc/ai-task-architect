import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './presentation/health.controller';
import { PrismaHealthIndicator } from './persistence/prisma.health';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [PrismaHealthIndicator],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- módulo do NestJS
export class HealthModule {}
