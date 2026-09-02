import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { ClsService } from 'nestjs-cls';
import type { Request, Response } from 'express';
import { AppLogger } from './app-logger';
import { CORRELATION_ID_HEADER, CORRELATION_ID_KEY } from './observability.constants';

/** Contexto de logging da requisição, montado uma vez por request. */
const HTTP_CONTEXT = 'HTTP';

/**
 * Interceptor global que emite uma linha JSON por requisição HTTP concluída
 * (sucesso ou erro), com method, url, statusCode, durationMs e correlationId.
 *
 * Regras de segurança: NUNCA loga body, headers, query ou tokens. Apenas os
 * metadados de roteamento e o tempo de resposta.
 *
 * Também espelha o correlation id no header de resposta `x-correlation-id`.
 * O erro é sempre repropagado (não é engolido).
 */
@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: AppLogger,
    private readonly cls: ClsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Só faz sentido para o transporte HTTP; outros contextos passam direto.
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const method = request.method;
    const url = request.originalUrl || request.url;
    const correlationId = this.readCorrelationId();

    // Espelha o correlation id na resposta de forma defensiva.
    if (correlationId && typeof response.setHeader === 'function') {
      response.setHeader(CORRELATION_ID_HEADER, correlationId);
    }

    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        this.logger.log('Requisição concluída', HTTP_CONTEXT, {
          method,
          url,
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
          correlationId,
        });
      }),
      catchError((error: unknown) => {
        const statusCode = error instanceof HttpException ? error.getStatus() : 500;
        this.logger.error('Requisição falhou', undefined, HTTP_CONTEXT, {
          method,
          url,
          statusCode,
          durationMs: Date.now() - startedAt,
          correlationId,
        });
        return throwError(() => error);
      }),
    );
  }

  /** Lê o correlation id do CLS de forma segura; undefined fora de request. */
  private readCorrelationId(): string | undefined {
    if (!this.cls.isActive()) {
      return undefined;
    }
    const value = this.cls.get<string | undefined>(CORRELATION_ID_KEY);
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
