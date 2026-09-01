import { Module, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { appConfig } from '../config/app.config';
import { LLM_PROVIDER, LlmProvider } from './domain/ports/llm-provider.port';
import { HuggingFaceProvider } from './infra/huggingface/huggingface.provider';
import { FakeLlmProvider } from './infra/fake/fake-llm.provider';
import { TasksRepository } from './tasks.repository';
import { GenerateTaskSpecificationUseCase } from './use-cases/generate-task-specification.use-case';
import { TasksController } from './tasks.controller';

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
  return new HuggingFaceProvider({ token: config.hfToken, model: config.hfModel });
}

@Module({
  controllers: [TasksController],
  providers: [
    TasksRepository,
    GenerateTaskSpecificationUseCase,
    {
      provide: LLM_PROVIDER,
      inject: [appConfig.KEY],
      useFactory: llmProviderFactory,
    },
  ],
  exports: [TasksRepository],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- módulo do NestJS
export class TasksModule {}
