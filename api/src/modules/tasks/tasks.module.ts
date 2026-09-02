import { Module, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { BullModule } from '@nestjs/bullmq';
import { appConfig } from '../../core/config/app.config';
import { LLM_PROVIDER, LlmProvider } from './domain/llm-provider.port';
import { HuggingFaceProvider } from './infra/huggingface.provider';
import { FakeLlmProvider } from './infra/fake-llm.provider';
import { TASK_REPOSITORY } from './domain/task.repository';
import { PrismaTaskRepository } from './persistence/prisma-task.repository';
import { GenerateTaskSpecificationUseCase } from './application/generate-task-specification.use-case';
import { EvaluateTaskSpecificationUseCase } from './application/evaluate-task-specification.use-case';
import { EvaluationQueue, EVALUATION_QUEUE } from './infra/evaluation.queue';
import { EvaluationProcessor } from './infra/evaluation.processor';
import { TasksController } from './presentation/tasks.controller';

/** Placeholder usado no .env de desenvolvimento quando não há token real. */
const PLACEHOLDER_TOKENS = new Set([
  'your_hugging_face_token_here',
  'hf_placeholder_token_para_desenvolvimento',
]);

/**
 * Seleciona a implementação do provider de LLM:
 * - FakeLlmProvider em ambiente de teste ou quando o token é um placeholder
 *   (permite subir a app e demonstrar a geração offline);
 * - HuggingFaceProvider quando há um token real configurado.
 */
export function llmProviderFactory(config: ConfigType<typeof appConfig>): LlmProvider {
  const logger = new Logger('LlmProviderFactory');
  const isPlaceholder = PLACEHOLDER_TOKENS.has(config.hfToken);

  if (config.nodeEnv === 'test' || isPlaceholder) {
    logger.warn('Usando FakeLlmProvider (token Hugging Face ausente ou placeholder)');
    return new FakeLlmProvider();
  }

  logger.log(`Usando HuggingFaceProvider (model=${config.hfModel})`);
  // Nota: a avaliação (LLM-as-Judge) reusa este mesmo provider e, por ora, o
  // mesmo model de geração. Um model dedicado ao juiz (`config.hfModelEvaluation`)
  // é um próximo passo — bastaria injetar um provider próprio parametrizado.
  return new HuggingFaceProvider({ token: config.hfToken, model: config.hfModel });
}

@Module({
  imports: [
    // JwtModule disponibiliza o JwtService usado pelo controller para validar o
    // token na rota SSE (autenticação manual via query string — ver ADR-005).
    JwtModule.register({}),
    // Conexão BullMQ a partir do redisUrl (ADR-006). forRootAsync injeta a
    // config para não acoplar a connection string em tempo de import.
    BullModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (config: ConfigType<typeof appConfig>) => ({
        connection: { url: config.redisUrl },
        // Defaults de job da avaliação (ADR-006): 3 tentativas com backoff
        // exponencial e limpeza de jobs concluídos/falhos para não crescer sem
        // limite no Redis.
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
      }),
    }),
    BullModule.registerQueue({ name: EVALUATION_QUEUE }),
  ],
  controllers: [TasksController],
  providers: [
    { provide: TASK_REPOSITORY, useClass: PrismaTaskRepository },
    GenerateTaskSpecificationUseCase,
    EvaluateTaskSpecificationUseCase,
    EvaluationQueue,
    EvaluationProcessor,
    {
      provide: LLM_PROVIDER,
      inject: [appConfig.KEY],
      useFactory: llmProviderFactory,
    },
  ],
  exports: [TASK_REPOSITORY],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- módulo do NestJS
export class TasksModule {}
