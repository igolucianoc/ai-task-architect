import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { CORRELATION_ID_KEY } from './observability.constants';

/** Níveis de log suportados, alinhados aos métodos do LoggerService do Nest. */
export type LogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose';

/**
 * Metadados opcionais anexados a uma linha de log.
 *
 * IMPORTANTE (segurança): este objeto é serializado como está. NUNCA passe aqui
 * objetos crus vindos de requisições (body, headers, tokens, senhas). O chamador
 * é responsável por selecionar apenas campos seguros e não sensíveis.
 */
export type LogMeta = Record<string, unknown>;

/** Estrutura de uma linha de log já pronta para serialização em JSON. */
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  correlationId?: string;
  meta?: LogMeta;
}

/**
 * Logger estruturado (uma linha JSON por evento) que enriquece cada log com o
 * correlation id do request atual, quando houver um contexto CLS ativo.
 *
 * Regras de segurança:
 * - A API expõe `message: string` + um objeto `meta` explícito. Não existe
 *   caminho que serialize objetos arbitrários (ex. Request) automaticamente,
 *   evitando vazamento de secrets.
 * - Fora de um request (bootstrap, workers), `cls.isActive()` retorna false e o
 *   correlationId é omitido — sem quebrar.
 *
 * Registrado como provider no ObservabilityModule e usado via
 * `app.useLogger(app.get(AppLogger))` no bootstrap.
 */
@Injectable({ scope: Scope.DEFAULT })
export class AppLogger implements LoggerService {
  constructor(private readonly cls: ClsService) {}

  log(message: unknown, context?: string, meta?: LogMeta): void {
    this.write('log', message, context, meta);
  }

  error(message: unknown, stackOrContext?: string, context?: string, meta?: LogMeta): void {
    // O Nest chama error(message, stack, context). Preservamos o stack como meta
    // quando informado, mantendo a mesma linha JSON.
    const resolvedContext = context ?? stackOrContext;
    const stack = context ? stackOrContext : undefined;
    const mergedMeta = stack ? { ...meta, stack } : meta;
    this.write('error', message, resolvedContext, mergedMeta);
  }

  warn(message: unknown, context?: string, meta?: LogMeta): void {
    this.write('warn', message, context, meta);
  }

  debug(message: unknown, context?: string, meta?: LogMeta): void {
    this.write('debug', message, context, meta);
  }

  verbose(message: unknown, context?: string, meta?: LogMeta): void {
    this.write('verbose', message, context, meta);
  }

  /** Monta a entrada estruturada e emite exatamente uma linha JSON no stdout/stderr. */
  private write(level: LogLevel, message: unknown, context?: string, meta?: LogMeta): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: this.normalizeMessage(message),
    };

    if (context) {
      entry.context = context;
    }

    const correlationId = this.readCorrelationId();
    if (correlationId) {
      entry.correlationId = correlationId;
    }

    if (meta && Object.keys(meta).length > 0) {
      entry.meta = meta;
    }

    const line = JSON.stringify(entry);

    if (level === 'error') {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }

  /** Converte a mensagem em string sem serializar objetos potencialmente sensíveis. */
  private normalizeMessage(message: unknown): string {
    if (typeof message === 'string') {
      return message;
    }
    if (message instanceof Error) {
      return message.message;
    }
    return String(message);
  }

  /** Lê o correlation id do CLS de forma segura; retorna undefined fora de request. */
  private readCorrelationId(): string | undefined {
    if (!this.cls.isActive()) {
      return undefined;
    }
    const value = this.cls.get<string | undefined>(CORRELATION_ID_KEY);
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
