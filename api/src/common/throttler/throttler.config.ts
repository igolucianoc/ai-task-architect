import { ThrottlerModuleOptions } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ConfigType } from '@nestjs/config';
import { appConfig } from '../../config/app.config';

/**
 * Rate limiting distribuído via Redis (compartilhado entre instâncias da API).
 * Limite global padrão: 100 req/min. Rotas sensíveis sobrescrevem via @Throttle.
 */
export function buildThrottlerOptions(
  config: ConfigType<typeof appConfig>,
): ThrottlerModuleOptions {
  return {
    throttlers: [{ name: 'default', limit: 100, ttl: 60_000 }],
    storage: new ThrottlerStorageRedisService(config.redisUrl),
  };
}
