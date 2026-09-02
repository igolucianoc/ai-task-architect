import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HttpException, HttpStatus, type ArgumentsHost } from '@nestjs/common';
import type { ClsService } from 'nestjs-cls';
import { GlobalExceptionFilter } from './global-exception.filter';
import { CORRELATION_ID_KEY } from '../../core/observability/observability.constants';

/** Estrutura do corpo de erro devolvido pelo filtro. */
interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
  correlationId?: string;
}

/** Mock de ClsService com correlation id opcional. */
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

/** Monta um ArgumentsHost HTTP capturando o corpo enviado na resposta. */
function makeHost(): {
  host: ArgumentsHost;
  getBody: () => ErrorBody | undefined;
  getStatus: () => number | undefined;
} {
  let sentBody: ErrorBody | undefined;
  let sentStatus: number | undefined;
  const response = {
    status: vi.fn().mockImplementation((code: number) => {
      sentStatus = code;
      return response;
    }),
    json: vi.fn().mockImplementation((body: ErrorBody) => {
      sentBody = body;
      return response;
    }),
  };
  const request = { method: 'GET', url: '/api/tasks' };
  const host = {
    switchToHttp: vi.fn().mockReturnValue({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, getBody: () => sentBody, getStatus: () => sentStatus };
}

describe('GlobalExceptionFilter', () => {
  let host: ReturnType<typeof makeHost>;

  beforeEach(() => {
    host = makeHost();
  });

  it('inclui o correlationId no corpo quando há contexto ativo', () => {
    const filter = new GlobalExceptionFilter(makeCls('corr-xyz'));
    filter.catch(new HttpException('proibido', HttpStatus.FORBIDDEN), host.host);

    const body = host.getBody();
    expect(host.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(body?.correlationId).toBe('corr-xyz');
    expect(body?.statusCode).toBe(HttpStatus.FORBIDDEN);
  });

  it('omite o correlationId quando não há contexto ativo', () => {
    const filter = new GlobalExceptionFilter(makeCls(undefined));
    filter.catch(new HttpException('proibido', HttpStatus.FORBIDDEN), host.host);

    const body = host.getBody();
    expect(body?.correlationId).toBeUndefined();
  });

  it('mapeia exceções desconhecidas para 500', () => {
    const filter = new GlobalExceptionFilter(makeCls('corr-1'));
    filter.catch(new Error('quebrou'), host.host);

    expect(host.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(host.getBody()?.error).toBe('InternalServerError');
  });
});
