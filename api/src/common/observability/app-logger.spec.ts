import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import type { ClsService } from 'nestjs-cls';
import { AppLogger } from './app-logger';
import { CORRELATION_ID_KEY } from './observability.constants';

/** Assinatura mínima de `process.stdout.write`/`stderr.write` que exercitamos. */
type WriteSpy = MockInstance<(chunk: string) => boolean>;

/** Estrutura esperada de cada linha JSON emitida pelo logger. */
interface ParsedLine {
  timestamp: string;
  level: string;
  message: string;
  context?: string;
  correlationId?: string;
  meta?: Record<string, unknown>;
}

/** Cria um mock de ClsService com correlation id opcional e contexto ativo/inativo. */
function makeCls(options: { active: boolean; correlationId?: string }): ClsService {
  return {
    isActive: vi.fn().mockReturnValue(options.active),
    get: vi.fn().mockImplementation((key?: string) => {
      if (key === CORRELATION_ID_KEY) {
        return options.correlationId;
      }
      return undefined;
    }),
  } as unknown as ClsService;
}

describe('AppLogger', () => {
  let stdout: WriteSpy;
  let stderr: WriteSpy;

  beforeEach(() => {
    stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Lê a primeira linha escrita no stream e faz o parse do JSON. */
  function firstLine(spy: WriteSpy): ParsedLine {
    const call = spy.mock.calls[0]?.[0];
    expect(typeof call).toBe('string');
    return JSON.parse(call) as ParsedLine;
  }

  it('emite uma linha JSON válida com nível e mensagem corretos', () => {
    const logger = new AppLogger(makeCls({ active: false }));

    logger.log('olá mundo', 'MeuContexto');

    expect(stdout).toHaveBeenCalledTimes(1);
    const entry = firstLine(stdout);
    expect(entry.level).toBe('log');
    expect(entry.message).toBe('olá mundo');
    expect(entry.context).toBe('MeuContexto');
    expect(typeof entry.timestamp).toBe('string');
    // A linha deve terminar com quebra de linha única.
    expect(stdout.mock.calls[0]?.[0]).toBe(`${JSON.stringify(entry)}\n`);
  });

  it('inclui correlationId quando o CLS tem um contexto ativo', () => {
    const logger = new AppLogger(makeCls({ active: true, correlationId: 'corr-123' }));

    logger.log('com correlação');

    const entry = firstLine(stdout);
    expect(entry.correlationId).toBe('corr-123');
  });

  it('NÃO inclui correlationId quando não há contexto ativo', () => {
    const logger = new AppLogger(makeCls({ active: false }));

    logger.log('sem correlação');

    const entry = firstLine(stdout);
    expect(entry.correlationId).toBeUndefined();
    expect('correlationId' in entry).toBe(false);
  });

  it('NÃO inclui correlationId quando o contexto está ativo mas sem id', () => {
    const logger = new AppLogger(makeCls({ active: true, correlationId: undefined }));

    logger.log('ativo sem id');

    const entry = firstLine(stdout);
    expect(entry.correlationId).toBeUndefined();
  });

  it('escreve erros no stderr e preserva o stack em meta', () => {
    const logger = new AppLogger(makeCls({ active: false }));

    logger.error('falhou', 'STACK-TRACE', 'MeuContexto');

    expect(stderr).toHaveBeenCalledTimes(1);
    const entry = firstLine(stderr);
    expect(entry.level).toBe('error');
    expect(entry.context).toBe('MeuContexto');
    expect(entry.meta?.stack).toBe('STACK-TRACE');
  });

  it('anexa metadados explícitos quando informados', () => {
    const logger = new AppLogger(makeCls({ active: true, correlationId: 'c-1' }));

    logger.log('com meta', 'HTTP', { method: 'GET', durationMs: 12 });

    const entry = firstLine(stdout);
    expect(entry.meta).toEqual({ method: 'GET', durationMs: 12 });
    expect(entry.correlationId).toBe('c-1');
  });
});
