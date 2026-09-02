import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- módulo do NestJS
export class PrismaModule {}
