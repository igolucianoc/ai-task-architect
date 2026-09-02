import { Injectable, Inject } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { LLM_PROVIDER, LlmProvider } from '../domain/llm-provider.port';
import { TaskSpecification } from '../domain/task-specification';
import { AppLogger } from '../../../core/observability/app-logger';
import { CORRELATION_ID_KEY } from '../../../core/observability/observability.constants';
import {
  parseJudgeResponse,
  evaluateQualityGate,
  type EvaluationOutcome,
  type QualityGateResult,
} from '../domain/task-evaluation';
import { buildJudgeMessages, JUDGE_PROMPT_VERSION } from './judge-prompt';
import { ITaskRepository, TASK_REPOSITORY } from '../domain/task.repository';

export interface EvaluateTaskInput {
  taskId: string;
  description: string;
  specification: TaskSpecification;
}

export type EvaluateTaskResult =
  | { status: 'completed'; result: QualityGateResult; overallScore: number }
  | { status: 'unavailable'; reason: string };

const MAX_TOKENS = 600;
// Temperatura 0: a avaliação deve ser o mais determinística possível. Não
// queremos criatividade no juiz — queremos julgamento estável e reproduzível.
const TEMPERATURE = 0;

/**
 * Caso de uso do LLM-as-Judge (assíncrono). Recebe apenas a necessidade original
 * e a especificação já gerada — princípio de INDEPENDÊNCIA: não reusa o contexto
 * de geração. Uma falha aqui NÃO derruba o fluxo de geração (o resultado já foi
 * entregue ao usuário); a avaliação apenas fica indisponível.
 */
@Injectable()
export class EvaluateTaskSpecificationUseCase {
  private readonly context = EvaluateTaskSpecificationUseCase.name;

  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @Inject(TASK_REPOSITORY) private readonly repository: ITaskRepository,
    private readonly logger: AppLogger,
    private readonly cls: ClsService,
  ) {}

  /** Lê o correlationId do contexto atual (request ou escopo do worker), se houver. */
  private correlationId(): string | undefined {
    return this.cls.isActive() ? this.cls.get<string | undefined>(CORRELATION_ID_KEY) : undefined;
  }

  async execute(input: EvaluateTaskInput): Promise<EvaluateTaskResult> {
    const taskId = input.taskId;

    try {
      const result = await this.llm.generate({
        messages: buildJudgeMessages({
          description: input.description,
          specification: input.specification,
        }),
        maxTokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      });

      // Observabilidade: nunca logar prompt/conteúdo/token; só metadados.
      // `tokens=n/d` continua sinalizando ausência de usage reportado pelo provider.
      const totalTokens = result.usage ? String(result.usage.totalTokens) : 'n/d';
      this.logger.log(`avaliação concluída taskId=${taskId}`, this.context, {
        operation: 'evaluation',
        taskId,
        model: result.model,
        promptTokens: result.usage?.promptTokens ?? null,
        completionTokens: result.usage?.completionTokens ?? null,
        totalTokens,
        latencyMs: result.latencyMs,
        promptVersion: JUDGE_PROMPT_VERSION,
        correlationId: this.correlationId(),
      });

      const parsed = parseJudgeResponse(result.content);
      if (!parsed.success) {
        // Saída do juiz não confiável: registra a avaliação como indisponível.
        this.logger.warn(`avaliação indisponível taskId=${taskId}`, this.context, {
          operation: 'evaluation',
          taskId,
          reason: parsed.error,
          promptVersion: JUDGE_PROMPT_VERSION,
          correlationId: this.correlationId(),
        });
        await this.repository.saveEvaluationUnavailable({ taskId, reason: parsed.error });
        return { status: 'unavailable', reason: parsed.error };
      }

      const gate = evaluateQualityGate(parsed.data.scores);
      const outcome: EvaluationOutcome = {
        scores: parsed.data.scores,
        overallScore: gate.overallScore,
        result: gate.result,
        reasons: gate.reasons,
        rationale: parsed.data.rationale,
      };

      await this.repository.saveEvaluationSuccess({
        taskId,
        outcome,
        model: result.model,
        promptVersion: JUDGE_PROMPT_VERSION,
        usage: result.usage,
        latencyMs: result.latencyMs,
      });

      return { status: 'completed', result: gate.result, overallScore: gate.overallScore };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro desconhecido do provider';
      this.logger.error(`avaliação falhou taskId=${taskId}`, undefined, this.context, {
        operation: 'evaluation',
        taskId,
        error: message,
        promptVersion: JUDGE_PROMPT_VERSION,
        correlationId: this.correlationId(),
      });
      await this.repository.saveEvaluationUnavailable({ taskId, reason: message });
      return { status: 'unavailable', reason: message };
    }
  }
}
