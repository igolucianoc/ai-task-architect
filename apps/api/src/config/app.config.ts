import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  HUGGINGFACE_API_TOKEN: z.string().min(1),
  HUGGINGFACE_MODEL_GENERATION: z.string().default('HuggingFaceH4/zephyr-7b-beta'),
  HUGGINGFACE_MODEL_EVALUATION: z.string().default('HuggingFaceH4/zephyr-7b-beta'),
});

export type AppConfig = z.infer<typeof envSchema> & {
  port: number;
  nodeEnv: string;
  corsOrigin: string;
  databaseUrl: string;
  redisUrl: string;
  jwtSecret: string;
  jwtAccessExpiresIn: string;
  refreshTokenTtlDays: number;
  huggingfaceApiToken: string;
  huggingfaceModelGeneration: string;
  huggingfaceModelEvaluation: string;
};

export const appConfig = registerAs('app', (): AppConfig => {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    throw new Error(`Variáveis de ambiente inválidas:\n${JSON.stringify(errors, null, 2)}`);
  }

  const env = parsed.data;

  return {
    ...env,
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    corsOrigin: env.CORS_ORIGIN,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    jwtSecret: env.JWT_SECRET,
    jwtAccessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    huggingfaceApiToken: env.HUGGINGFACE_API_TOKEN,
    huggingfaceModelGeneration: env.HUGGINGFACE_MODEL_GENERATION,
    huggingfaceModelEvaluation: env.HUGGINGFACE_MODEL_EVALUATION,
  };
});
