import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError, firstValueFrom, lastValueFrom } from 'rxjs';
import { HttpException, HttpStatus, type CallHandler, type ExecutionContext } from '@nestjs/common';
import type { ClsService } from 'nestjs-cls';
import { HttpLoggingInterceptor } from './http-logging.interceptor';
import type { AppLogger, LogMeta } from './app-logger';
import { CORRELATION_ID_HEADER, CORRELATION_ID_KEY } from './observability.constants';

/** Mock do AppLogger capturando as chamadas de log/error. */
function makeLogger(): {
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} {
  return { log: vi.fn(), error: vi.fn() };
}

/** Mock de ClsService com correlation id fixo e contexto ativo. */
function makeCls(correlationId: string | undefined): ClsService {
  return {
    isActive: vi.fn().mockReturnValue(correlationId !== undefined),
    get: vi
      .fn()
      .mockImplementation((key?: string) =>
        key === CORRELATION_ID_KEY ? correlationId : undefined,
      ),
  } as unknown as ClsService;
}

/** Monta um ExecutionContext HTTP com request/response mockados. */
function makeContext(setHeader: ReturnType<typeof vi.fn>): {
  context: ExecutionContext;
  response: { statusCode: number; setHeader: ReturnType<typeof vi.fn> };
} {
  const response = { statusCode: 200, setHeader };
  const request = { method: 'GET', originalUrl: '/api/tasks', url: '/api/tasks' };
  const context = {
    getType: vi.fn().mockReturnValue('http'),
    switchToHttp: vi.fn().mockReturnValue({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { context, response };
}

describe('HttpLoggingInterceptor', () => {
  let logger: ReturnType<typeof makeLogger>;
  let setHeader: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    logger = makeLogger();
    setHeader = vi.fn();
  });

  it('loga method/url/status/durationMs/correlationId no sucesso', async () => {
    const cls = makeCls('corr-abc');
    const interceptor = new HttpLoggingInterceptor(logger as unknown as AppLogger, cls);
    const { context } = makeContext(setHeader);
    const next: CallHandler = { handle: () => of({ ok: true }) };

    const result = await firstValueFrom(interceptor.intercept(context, next));

    expect(result).toEqual({ ok: true });
    expect(logger.log).toHaveBeenCalledTimes(1);
    const meta = logger.log.mock.calls[0]?.[2] as LogMeta;
    expect(meta.method).toBe('GET');
    expect(meta.url).toBe('/api/tasks');
    expect(meta.statusCode).toBe(200);
    expect(typeof meta.durationMs).toBe('number');
    expect(meta.correlationId).toBe('corr-abc');
  });

  it('seta o header x-correlation-id na resposta', async () => {
    const cls = makeCls('corr-abc');
    const interceptor = new HttpLoggingInterceptor(logger as unknown as AppLogger, cls);
    const { context } = makeContext(setHeader);
    const next: CallHandler = { handle: () => of(null) };

    await firstValueFrom(interceptor.intercept(context, next));

    expect(setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, 'corr-abc');
  });

  it('loga o erro e relança quando o handler falha (HttpException)', async () => {
    const cls = makeCls('corr-err');
    const interceptor = new HttpLoggingInterceptor(logger as unknown as AppLogger, cls);
    const { context } = makeContext(setHeader);
    const boom = new HttpException('não encontrado', HttpStatus.NOT_FOUND);
    const next: CallHandler = { handle: () => throwError(() => boom) };

    await expect(lastValueFrom(interceptor.intercept(context, next))).rejects.toBe(boom);

    expect(logger.error).toHaveBeenCalledTimes(1);
    const meta = logger.error.mock.calls[0]?.[3] as LogMeta;
    expect(meta.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(meta.method).toBe('GET');
    expect(meta.correlationId).toBe('corr-err');
  });

  it('usa status 500 quando o erro não é HttpException', async () => {
    const cls = makeCls('corr-err');
    const interceptor = new HttpLoggingInterceptor(logger as unknown as AppLogger, cls);
    const { context } = makeContext(setHeader);
    const boom = new Error('inesperado');
    const next: CallHandler = { handle: () => throwError(() => boom) };

    await expect(lastValueFrom(interceptor.intercept(context, next))).rejects.toBe(boom);

    const meta = logger.error.mock.calls[0]?.[3] as LogMeta;
    expect(meta.statusCode).toBe(500);
  });

  it('não seta o header quando não há correlation id', async () => {
    const cls = makeCls(undefined);
    const interceptor = new HttpLoggingInterceptor(logger as unknown as AppLogger, cls);
    const { context } = makeContext(setHeader);
    const next: CallHandler = { handle: () => of(null) };

    await firstValueFrom(interceptor.intercept(context, next));

    expect(setHeader).not.toHaveBeenCalled();
  });
});
