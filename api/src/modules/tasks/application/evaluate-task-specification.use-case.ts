import { Injectable, Inject, Logger } from '@nestjs/common';
import { LLM_PROVIDER, LlmProvider } from './llm-provider.port';
import { TaskSpecification } from './task-specification';
import {
  parseJudgeResponse,
  evaluateQualityGate,
  type EvaluationOutcome,
  type QualityGateResult,
} from './task-evaluation';
import { buildJudgeMessages, JUDGE_PROMPT_VERSION } from './judge-prompt';
import { TasksRepository } from '../infrastructure/tasks.repository';

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
  private readonly logger = new Logger(EvaluateTaskSpecificationUseCase.name);

  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly repository: TasksRepository,
  ) {}

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
      const totalTokens = result.usage ? String(result.usage.totalTokens) : 'n/d';
      this.logger.log(
        `avaliação taskId=${taskId} model=${result.model} ` +
          `tokens=${totalTokens} latencyMs=${String(result.latencyMs)}`,
      );

      const parsed = parseJudgeResponse(result.content);
      if (!parsed.success) {
        // Saída do juiz não confiável: registra a avaliação como indisponível.
        this.logger.warn(`avaliação taskId=${taskId} indisponível: ${parsed.error}`);
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
      this.logger.error(`avaliação taskId=${taskId} falhou: ${message}`);
      await this.repository.saveEvaluationUnavailable({ taskId, reason: message });
      return { status: 'unavailable', reason: message };
    }
  }
}
