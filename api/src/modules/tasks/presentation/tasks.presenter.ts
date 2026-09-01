import { EvaluationStatus, Prisma, TaskEvaluation } from '@prisma/client';
import { Task } from '@prisma/client';
import { TaskWithRelations } from '../infrastructure/tasks.repository';
import { TaskSpecification } from '../application/task-specification';

export interface TaskSummaryView {
  id: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Resposta de `POST /tasks` no fluxo B1: a tarefa é apenas criada (PENDING) e a
 * geração é disparada depois via `GET /tasks/:id/stream`.
 */
export interface TaskCreatedView {
  taskId: string;
  status: string;
}

export function toTaskCreated(task: Task): TaskCreatedView {
  return { taskId: task.id, status: task.status };
}

/**
 * Visão serializável da avaliação (LLM-as-Judge) para o cliente. A avaliação é
 * assíncrona: o cliente a obtém consultando `GET /tasks/:id` DEPOIS que o stream
 * SSE da geração encerrou — não há evento SSE de avaliação.
 */
export interface TaskEvaluationView {
  status: string;
  result: string | null;
  overallScore: number | null;
  rationale: string | null;
  criteria: Record<string, number> | null;
  reasons: string[];
  model: string | null;
  promptVersion: string | null;
  evaluatedAt: string | null;
}

export interface TaskDetailView extends TaskSummaryView {
  specification: TaskSpecification | null;
  lastRun: {
    status: string;
    model: string;
    errorMessage: string | null;
    startedAt: string;
    finishedAt: string | null;
  } | null;
  evaluation: TaskEvaluationView | null;
}

export function toTaskSummary(task: Task): TaskSummaryView {
  return {
    id: task.id,
    description: task.description,
    status: task.status,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function toTaskDetail(task: TaskWithRelations): TaskDetailView {
  const latestArtifact = task.artifacts.at(0);
  const latestRun = task.generationRuns.at(0);

  return {
    ...toTaskSummary(task),
    specification: latestArtifact ? parseArtifactContent(latestArtifact.content) : null,
    lastRun: latestRun
      ? {
          status: latestRun.status,
          model: latestRun.model,
          errorMessage: latestRun.errorMessage,
          startedAt: latestRun.startedAt.toISOString(),
          finishedAt: latestRun.finishedAt ? latestRun.finishedAt.toISOString() : null,
        }
      : null,
    evaluation: toTaskEvaluationView(task.evaluation),
  };
}

/**
 * Converte o Decimal `score` do Prisma para `number` de forma segura.
 * `Prisma.Decimal` expõe `.toNumber()`; para qualquer outro shape, retorna null.
 */
function decimalToNumber(score: Prisma.Decimal | null): number | null {
  if (score === null) {
    return null;
  }
  return score.toNumber();
}

/**
 * Type guard: confirma que `value` é um objeto simples (não-null, não-array).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Extrai as notas por critério do Json `dimensions` de forma defensiva: só
 * aceita `scores` como objeto cujos valores são todos números. Qualquer shape
 * inesperado (string, objeto sem `scores`, valores não-numéricos) resulta em
 * null — nunca lança.
 */
function extractCriteria(dimensions: Prisma.JsonValue | null): Record<string, number> | null {
  if (!isPlainObject(dimensions)) {
    return null;
  }
  const { scores } = dimensions;
  if (!isPlainObject(scores)) {
    return null;
  }
  const criteria: Record<string, number> = {};
  for (const [key, value] of Object.entries(scores)) {
    if (typeof value !== 'number') {
      return null;
    }
    criteria[key] = value;
  }
  return criteria;
}

/**
 * Extrai os motivos do Json `dimensions` de forma defensiva: só aceita
 * `reasons` como array de strings; caso contrário retorna `[]`.
 */
function extractReasons(dimensions: Prisma.JsonValue | null): string[] {
  if (!isPlainObject(dimensions)) {
    return [];
  }
  const { reasons } = dimensions;
  if (!Array.isArray(reasons)) {
    return [];
  }
  return reasons.filter((reason): reason is string => typeof reason === 'string');
}

/**
 * Serializa a avaliação para o cliente. Retorna `null` quando não há avaliação
 * (ainda não processada). O parse do Json `dimensions` é defensivo: não confia
 * no shape em disco.
 */
export function toTaskEvaluationView(evaluation: TaskEvaluation | null): TaskEvaluationView | null {
  if (!evaluation) {
    return null;
  }

  // `evaluatedAt` só faz sentido em estados finais (concluída ou indisponível);
  // enquanto PENDING, ainda não houve avaliação de fato.
  const isFinal =
    evaluation.status === EvaluationStatus.COMPLETED ||
    evaluation.status === EvaluationStatus.UNAVAILABLE;

  return {
    status: evaluation.status,
    result: evaluation.result,
    overallScore: decimalToNumber(evaluation.score),
    rationale: evaluation.rationale,
    criteria: extractCriteria(evaluation.dimensions),
    reasons: extractReasons(evaluation.dimensions),
    model: evaluation.model,
    promptVersion: evaluation.promptVersion,
    evaluatedAt: isFinal ? evaluation.updatedAt.toISOString() : null,
  };
}

/**
 * O artifact foi persistido como JSON já validado. Ainda assim, fazemos parse
 * defensivo: se algo estiver corrompido, retornamos null em vez de quebrar.
 * Exportado para reidratar a especificação no stream SSE quando a tarefa já
 * está COMPLETED.
 */
export function parseArtifactContent(content: string): TaskSpecification | null {
  try {
    return JSON.parse(content) as TaskSpecification;
  } catch {
    return null;
  }
}
