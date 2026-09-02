import { Task, TaskGenerationRun, TaskEvaluation, LlmUsage } from '@prisma/client';
import { TaskSpecification } from './task-specification';
import { EvaluationOutcome } from './task-evaluation';
import { LlmUsageMetrics } from './llm-provider.port';

/**
 * Dados necessários para avaliar uma task já concluída: a necessidade original
 * (`description`) e a especificação reidratada do último artifact.
 */
export interface TaskEvaluationSource {
  description: string;
  specification: TaskSpecification;
}

/**
 * Campos de uso de LLM carregados junto das runs e da avaliação para
 * observabilidade (tokens, latência e custo). Mantém apenas o que o presenter
 * expõe — nunca inclui nada sensível (o token de acesso não vive aqui).
 */
export type LlmUsageForTask = Pick<
  LlmUsage,
  | 'operation'
  | 'model'
  | 'promptTokens'
  | 'completionTokens'
  | 'totalTokens'
  | 'latencyMs'
  | 'estimatedCost'
>;

export interface TaskWithRelations extends Task {
  artifacts: { id: string; content: string; contentFormat: string; createdAt: Date }[];
  generationRuns: (Pick<
    TaskGenerationRun,
    'id' | 'status' | 'model' | 'errorMessage' | 'startedAt' | 'finishedAt'
  > & { llmUsages: LlmUsageForTask[] })[];
  // Avaliação assíncrona (LLM-as-Judge): persistida pelo worker DEPOIS que o
  // stream SSE já encerrou. Fica `null` até a avaliação ser concluída. Carrega
  // também os usos de LLM (operation EVALUATION) vinculados à avaliação.
  evaluation: (TaskEvaluation & { llmUsages: LlmUsageForTask[] }) | null;
}

export interface SuccessfulRunInput {
  taskId: string;
  runId: string;
  model: string;
  specification: TaskSpecification;
  usage: LlmUsageMetrics | null;
  latencyMs: number;
}

export interface FailedRunInput {
  taskId: string;
  runId: string;
  errorMessage: string;
}

export interface SaveEvaluationSuccessInput {
  taskId: string;
  outcome: EvaluationOutcome;
  model: string;
  promptVersion: string;
  usage: LlmUsageMetrics | null;
  latencyMs: number;
}

export interface SaveEvaluationUnavailableInput {
  taskId: string;
  reason: string;
}

/**
 * Domain-owned port for task persistence. Implementations live in the
 * persistence layer (Prisma for production, in-memory for tests).
 */
export interface ITaskRepository {
  createPendingTask(userId: string, description: string): Promise<Task>;
  startRun(taskId: string, model: string): Promise<TaskGenerationRun>;
  createTaskWithRun(
    userId: string,
    description: string,
    model: string,
  ): Promise<{ task: Task; run: TaskGenerationRun }>;
  completeRun(input: SuccessfulRunInput): Promise<void>;
  failRun(input: FailedRunInput): Promise<void>;
  saveEvaluationSuccess(input: SaveEvaluationSuccessInput): Promise<void>;
  saveEvaluationUnavailable(input: SaveEvaluationUnavailableInput): Promise<void>;
  findEvaluationByTaskId(taskId: string): Promise<TaskEvaluation | null>;
  findTaskWithArtifactById(taskId: string): Promise<TaskEvaluationSource | null>;
  findByIdForUser(taskId: string, userId: string): Promise<TaskWithRelations | null>;
  deleteForUser(taskId: string, userId: string): Promise<boolean>;
  listForUser(
    userId: string,
    skip: number,
    take: number,
  ): Promise<{ items: Task[]; total: number }>;
}

/** Injection token for {@link ITaskRepository}. */
export const TASK_REPOSITORY = Symbol('ITaskRepository');
