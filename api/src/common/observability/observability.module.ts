import { randomUUID } from 'node:crypto';
import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ClsModule, type ClsService } from 'nestjs-cls';
import type { Request } from 'express';
import { AppLogger } from './app-logger';
import { HttpLoggingInterceptor } from './http-logging.interceptor';
import { CORRELATION_ID_HEADER, CORRELATION_ID_KEY } from './observability.constants';
import { GlobalExceptionFilter } from '../filters/global-exception.filter';

/**
 * Extrai o header `x-correlation-id` de entrada de forma segura.
 * O Express expõe headers como `string | string[] | undefined`; consideramos
 * apenas o primeiro valor string não vazio.
 */
function readIncomingCorrelationId(req: Request): string | undefined {
  const header = req.headers[CORRELATION_ID_HEADER];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Módulo transversal de observabilidade.
 *
 * Responsabilidades:
 * - Configura o CLS (AsyncLocalStorage) via middleware montado em todas as rotas,
 *   gerando/reaproveitando o correlation id por requisição.
 * - Provê o AppLogger (logger estruturado) para toda a aplicação.
 * - Registra o interceptor global de logging HTTP.
 * - Registra o GlobalExceptionFilter via APP_FILTER para habilitar DI do
 *   ClsService (permitindo incluir o correlationId no corpo/log de erro).
 *
 * É `@Global` para que o AppLogger e o ClsService fiquem disponíveis em qualquer
 * módulo sem reimportação.
 */
@Global()
@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        // Armazena o correlation id sob uma chave estável para leitura em
        // qualquer ponto do request. Reaproveita o header de entrada quando
        // presente; senão gera um UUID v4 aqui mesmo — não dependemos de
        // `cls.getId()` para evitar acoplamento com a ordem interna do middleware.
        setup: (cls: ClsService, req: Request): void => {
          cls.set(CORRELATION_ID_KEY, readIncomingCorrelationId(req) ?? randomUUID());
        },
      },
    }),
  ],
  providers: [
    AppLogger,
    { provide: APP_INTERCEPTOR, useClass: HttpLoggingInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
  exports: [AppLogger],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- módulo de wiring do NestJS
export class ObservabilityModule {}
