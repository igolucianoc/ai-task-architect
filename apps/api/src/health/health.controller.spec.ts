import { describe, it, expect, vi } from 'vitest';
import { HealthCheckService, HealthCheckResult } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './prisma.health';

describe('HealthController', () => {
  it('deve retornar status ok quando o banco está saudável', async () => {
    const mockResult: HealthCheckResult = {
      status: 'ok',
      info: { database: { status: 'up' } },
      error: {},
      details: { database: { status: 'up' } },
    };

    const healthService = {
      check: vi.fn().mockResolvedValue(mockResult),
    } as unknown as HealthCheckService;

    const prismaHealth = {
      isHealthy: vi.fn().mockResolvedValue({ database: { status: 'up' } }),
    } as unknown as PrismaHealthIndicator;

    const checkSpy = vi.mocked(healthService.check);
    const controller = new HealthController(healthService, prismaHealth);
    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(checkSpy).toHaveBeenCalledOnce();
  });
});
