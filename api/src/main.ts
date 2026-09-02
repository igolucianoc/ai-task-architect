import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AppLogger } from './common/observability/app-logger';
import { appConfig } from './config/app.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    bufferLogs: true,
  });

  // Substitui o logger padrão pelo logger estruturado (JSON + correlationId).
  // Resolvido do container porque depende de injeção (ClsService).
  app.useLogger(app.get(AppLogger));
  app.flushLogs();

  const config = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  // O GlobalExceptionFilter agora é registrado via APP_FILTER no
  // ObservabilityModule para habilitar DI do ClsService.

  app.enableCors({
    origin: config.corsOrigin,
    credentials: true,
  });

  await app.listen(config.port);

  const logger = new Logger('Bootstrap');
  logger.log(`API rodando em http://localhost:${String(config.port)}/api`);
}

bootstrap().catch((err: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error('Falha ao iniciar a aplicação', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
