import { Injectable, Inject } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { LLM_PROVIDER, LlmProvider } from './llm-provider.port';
import { parseTaskSpecification, TaskSpecification } from './task-specification';
import { buildGenerationMessages } from './prompt-builder';
import { AppLogger } from '../../../common/observability/app-logger';
import { CORRELATION_ID_KEY } from '../../../common/observability/observability.constants';
import { TasksRepository } from '../infrastructure/tasks.repository';
import {
  buildEvent,
  type TaskGenerationEvent,
  type TaskGenerationEventListener,
} from './task-generation-events';

export interface GenerateTaskInput {
  taskId: string;
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
  private readonly context = GenerateTaskSpecificationUseCase.name;

  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly repository: TasksRepository,
    private readonly logger: AppLogger,
    private readonly cls: ClsService,
  ) {}

  /** Lê o correlationId do contexto atual (request ou escopo do worker), se houver. */
  private correlationId(): string | undefined {
    return this.cls.isActive() ? this.cls.get<string | undefined>(CORRELATION_ID_KEY) : undefined;
  }

  async execute(
    input: GenerateTaskInput,
    onEvent?: TaskGenerationEventListener,
  ): Promise<GenerateTaskResult> {
    // A Task já existe (criada em `POST /tasks`). Aqui apenas iniciamos a run e
    // colocamos a Task em STREAMING.
    const taskId = input.taskId;
    const run = await this.repository.startRun(taskId, this.modelHint());

    // `run.id` correlaciona todos os eventos de uma mesma geração.
    const runId = run.id;

    // Progresso: geração iniciada (run já persistida, Task em STREAMING).
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
      // `tokens=n/d` continua sinalizando ausência de usage reportado pelo provider.
      const totalTokens = result.usage ? String(result.usage.totalTokens) : 'n/d';
      this.logger.log(`geração concluída taskId=${taskId}`, this.context, {
        operation: 'generation',
        taskId,
        runId,
        model: result.model,
        promptTokens: result.usage?.promptTokens ?? null,
        completionTokens: result.usage?.completionTokens ?? null,
        totalTokens,
        latencyMs: result.latencyMs,
        correlationId: this.correlationId(),
      });

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
        this.logger.warn(`geração rejeitada taskId=${taskId}`, this.context, {
          operation: 'generation',
          taskId,
          runId,
          reason: parsed.error,
          correlationId: this.correlationId(),
        });
        await this.repository.failRun({
          taskId,
          runId,
          errorMessage: `Resposta do modelo inválida: ${parsed.error}`,
        });
        this.emit(onEvent, buildEvent({ event: 'failed', runId, taskId, error: parsed.error }));
        return { status: 'failed', taskId, error: parsed.error };
      }

      await this.repository.completeRun({
        taskId,
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
          taskId,
          specification: parsed.data,
        }),
      );

      return { status: 'completed', taskId, specification: parsed.data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro desconhecido do provider';
      this.logger.error(`geração falhou taskId=${taskId}`, undefined, this.context, {
        operation: 'generation',
        taskId,
        runId,
        error: message,
        correlationId: this.correlationId(),
      });
      await this.repository.failRun({
        taskId,
        runId,
        errorMessage: message,
      });
      this.emit(onEvent, buildEvent({ event: 'failed', runId, taskId, error: message }));
      return { status: 'failed', taskId, error: message };
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
      this.logger.warn(`listener de evento '${event.event}' falhou`, this.context, {
        operation: 'generation',
        event: event.event,
        error: message,
        correlationId: this.correlationId(),
      });
    }
  }

  private modelHint(): string {
    // O modelo efetivo é reportado pelo provider no resultado; aqui registramos
    // apenas um rótulo inicial para a run. Mantido simples de propósito.
    return 'pending';
  }
}
