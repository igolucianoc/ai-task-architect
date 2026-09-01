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
  // Hugging Face é o provider exclusivo de LLM (ver prompts/huggingface-access-token.md).
  // HF_TOKEN e HF_MODEL são os nomes canônicos definidos naquele documento.
  HF_TOKEN: z.string().min(1, 'HF_TOKEN é obrigatório'),
  HF_MODEL: z.string().min(1).default('HuggingFaceH4/zephyr-7b-beta'),
  // Modelo dedicado à avaliação (Etapa 07); se ausente, usa o mesmo de geração.
  HF_MODEL_EVALUATION: z.string().min(1).optional(),
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
  hfToken: string;
  hfModel: string;
  hfModelEvaluation: string;
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
    hfToken: env.HF_TOKEN,
    hfModel: env.HF_MODEL,
    hfModelEvaluation: env.HF_MODEL_EVALUATION ?? env.HF_MODEL,
  };
});
