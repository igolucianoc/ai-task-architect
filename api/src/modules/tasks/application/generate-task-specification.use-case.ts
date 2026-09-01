import { Injectable, Inject, Logger } from '@nestjs/common';
import { LLM_PROVIDER, LlmProvider } from './llm-provider.port';
import { parseTaskSpecification, TaskSpecification } from './task-specification';
import { buildGenerationMessages } from './prompt-builder';
import { TasksRepository } from '../infrastructure/tasks.repository';
import {
  buildEvent,
  type TaskGenerationEvent,
  type TaskGenerationEventListener,
} from './task-generation-events';

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

  async execute(
    input: GenerateTaskInput,
    onEvent?: TaskGenerationEventListener,
  ): Promise<GenerateTaskResult> {
    const { task, run } = await this.repository.createTaskWithRun(
      input.userId,
      input.description,
      this.modelHint(),
    );

    // `run.id` correlaciona todos os eventos de uma mesma geração.
    const runId = run.id;

    // Progresso: geração iniciada (task+run já persistidas).
    this.emit(onEvent, buildEvent({ event: 'started', runId }));

    try {
      // Progresso: prestes a consultar o LLM.
      this.emit(onEvent, buildEvent({ event: 'analyzing_context', runId }));

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

      // Marcos de progresso, NÃO fases reais do provider: a geração é uma única
      // chamada ao LLM. Emitimos estes marcos após receber o conteúdo, apenas
      // para dar feedback humano de andamento ao consumidor do stream.
      this.emit(
        onEvent,
        buildEvent({
          event: 'generating_requirements',
          runId,
          message: 'Elaborando requisitos funcionais e não funcionais.',
        }),
      );
      this.emit(
        onEvent,
        buildEvent({
          event: 'generating_acceptance_criteria',
          runId,
          message: 'Derivando critérios de aceite.',
        }),
      );

      // Progresso: prestes a validar/parsear a saída do modelo.
      this.emit(onEvent, buildEvent({ event: 'evaluating', runId }));

      const parsed = parseTaskSpecification(result.content);
      if (!parsed.success) {
        // Saída do modelo não confiável: não persistir artefato inválido.
        this.logger.warn(`geração taskId=${task.id} rejeitada: ${parsed.error}`);
        await this.repository.failRun({
          taskId: task.id,
          runId,
          errorMessage: `Resposta do modelo inválida: ${parsed.error}`,
        });
        this.emit(
          onEvent,
          buildEvent({ event: 'failed', runId, taskId: task.id, error: parsed.error }),
        );
        return { status: 'failed', taskId: task.id, error: parsed.error };
      }

      await this.repository.completeRun({
        taskId: task.id,
        runId,
        model: result.model,
        specification: parsed.data,
        usage: result.usage,
        latencyMs: result.latencyMs,
      });

      this.emit(
        onEvent,
        buildEvent({
          event: 'completed',
          runId,
          taskId: task.id,
          specification: parsed.data,
        }),
      );

      return { status: 'completed', taskId: task.id, specification: parsed.data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro desconhecido do provider';
      this.logger.error(`geração taskId=${task.id} falhou: ${message}`);
      await this.repository.failRun({
        taskId: task.id,
        runId,
        errorMessage: message,
      });
      this.emit(onEvent, buildEvent({ event: 'failed', runId, taskId: task.id, error: message }));
      return { status: 'failed', taskId: task.id, error: message };
    }
  }

  /**
   * Emite um evento ao listener de forma protegida: uma exceção lançada pelo
   * consumidor (transporte, SSE, etc.) NÃO pode derrubar a geração. Falhas do
   * listener são apenas registradas em nível de aviso.
   */
  private emit(onEvent: TaskGenerationEventListener | undefined, event: TaskGenerationEvent): void {
    if (!onEvent) {
      return;
    }
    try {
      onEvent(event);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro desconhecido no listener';
      this.logger.warn(`listener de evento '${event.event}' falhou: ${message}`);
    }
  }

  private modelHint(): string {
    // O modelo efetivo é reportado pelo provider no resultado; aqui registramos
    // apenas um rótulo inicial para a run. Mantido simples de propósito.
    return 'pending';
  }
}
