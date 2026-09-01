import { Injectable, Inject, Logger } from '@nestjs/common';
import { LLM_PROVIDER, LlmProvider } from './llm-provider.port';
import { parseTaskSpecification, TaskSpecification } from './task-specification';
import { buildGenerationMessages } from './prompt-builder';
import { TasksRepository } from '../infrastructure/tasks.repository';

export interface GenerateTaskInput {
  userId: string;
  description: string;
}

export type GenerateTaskResult =
  | { status: 'completed'; taskId: string; specification: TaskSpecification }
  | { status: 'failed'; taskId: string; error: string };

const MAX_TOKENS = 1200;
const TEMPERATURE = 0.3;

@Injectable()
export class GenerateTaskSpecificationUseCase {
  private readonly logger = new Logger(GenerateTaskSpecificationUseCase.name);

  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly repository: TasksRepository,
  ) {}

  async execute(input: GenerateTaskInput): Promise<GenerateTaskResult> {
    const { task, run } = await this.repository.createTaskWithRun(
      input.userId,
      input.description,
      this.modelHint(),
    );

    try {
      const result = await this.llm.generate({
        messages: buildGenerationMessages(input.description),
        maxTokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      });

      // Observabilidade: nunca logar prompt/conteúdo/token; só metadados.
      const totalTokens = result.usage ? String(result.usage.totalTokens) : 'n/d';
      this.logger.log(
        `geração taskId=${task.id} model=${result.model} ` +
          `tokens=${totalTokens} latencyMs=${String(result.latencyMs)}`,
      );

      const parsed = parseTaskSpecification(result.content);
      if (!parsed.success) {
        // Saída do modelo não confiável: não persistir artefato inválido.
        this.logger.warn(`geração taskId=${task.id} rejeitada: ${parsed.error}`);
        await this.repository.failRun({
          taskId: task.id,
          runId: run.id,
          errorMessage: `Resposta do modelo inválida: ${parsed.error}`,
        });
        return { status: 'failed', taskId: task.id, error: parsed.error };
      }

      await this.repository.completeRun({
        taskId: task.id,
        runId: run.id,
        model: result.model,
        specification: parsed.data,
        usage: result.usage,
        latencyMs: result.latencyMs,
      });

      return { status: 'completed', taskId: task.id, specification: parsed.data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro desconhecido do provider';
      this.logger.error(`geração taskId=${task.id} falhou: ${message}`);
      await this.repository.failRun({
        taskId: task.id,
        runId: run.id,
        errorMessage: message,
      });
      return { status: 'failed', taskId: task.id, error: message };
    }
  }

  private modelHint(): string {
    // O modelo efetivo é reportado pelo provider no resultado; aqui registramos
    // apenas um rótulo inicial para a run. Mantido simples de propósito.
    return 'pending';
  }
}
