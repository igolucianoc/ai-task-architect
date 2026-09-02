import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ClsService } from 'nestjs-cls';
import { CORRELATION_ID_KEY } from '../observability/observability.constants';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
  correlationId?: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly cls: ClsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, message, error } = this.resolveError(exception);
    const correlationId = this.readCorrelationId();

    const body: ErrorResponse = {
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (correlationId) {
      body.correlationId = correlationId;
    }

    const suffix = correlationId ? ` [correlationId=${correlationId}]` : '';
    const logLine = `${request.method} ${request.url} → ${String(statusCode)}${suffix}`;

    if (statusCode >= 500) {
      this.logger.error(logLine, exception instanceof Error ? exception.stack : String(exception));
    } else {
      this.logger.warn(`${logLine}: ${String(message)}`);
    }

    response.status(statusCode).json(body);
  }

  /** Lê o correlation id do CLS de forma segura; undefined fora de request. */
  private readCorrelationId(): string | undefined {
    // Em runtime normal o ClsService é injetado; guardamos contra ausência
    // (contexto de teste sem o provider) para o filtro nunca quebrar ao tratar
    // um erro. O cast reconhece que a DI pode não ter populado a dependência.
    const cls = this.cls as ClsService | undefined;
    if (!cls || !cls.isActive()) {
      return undefined;
    }
    const value = cls.get<string | undefined>(CORRELATION_ID_KEY);
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private resolveError(exception: unknown): {
    statusCode: number;
    message: string | string[];
    error: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const message =
        typeof res === 'object' && 'message' in res
          ? (res as { message: string | string[] }).message
          : exception.message;

      return { statusCode: status, message, error: exception.name };
    }

    if (exception instanceof ZodError) {
      const messages = exception.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      return {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        message: messages,
        error: 'ValidationError',
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno do servidor',
      error: 'InternalServerError',
    };
  }
}
