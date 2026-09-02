import { EvaluationStatus, LlmOperation, Prisma, TaskEvaluation } from '@prisma/client';
import { Task } from '@prisma/client';
import { LlmUsageForTask, TaskWithRelations } from '../infrastructure/tasks.repository';
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
/**
 * Métricas de uso de LLM de uma run (geração). `estimatedCost` sai como
 * `number` (Decimal convertido). Estes "tokens" são contadores de uso do LLM —
 * não há nada sensível aqui.
 */
export interface LlmUsageView {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  estimatedCost: number;
}

/**
 * Métricas de uso de LLM da avaliação (LLM-as-Judge). O `model` já é exposto no
 * nível da avaliação (`TaskEvaluationView.model`), então não repetimos aqui.
 */
export interface EvaluationUsageView {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  estimatedCost: number;
}

/**
 * Agregado de uso de LLM de toda a task (geração + avaliação). Soma tokens e
 * custo de todos os usos. Zeros quando não há nenhum uso registrado.
 */
export interface LlmTotalsView {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

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
  usage: EvaluationUsageView | null;
}

export interface TaskDetailView extends TaskSummaryView {
  specification: TaskSpecification | null;
  lastRun: {
    status: string;
    model: string;
    errorMessage: string | null;
    startedAt: string;
    finishedAt: string | null;
    usage: LlmUsageView | null;
  } | null;
  evaluation: TaskEvaluationView | null;
  llmTotals: LlmTotalsView;
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
          usage: toRunUsageView(latestRun.llmUsages),
        }
      : null,
    evaluation: toTaskEvaluationView(task.evaluation),
    llmTotals: buildLlmTotals(task),
  };
}

/**
 * Converte `estimatedCost` (Decimal) para `number` de forma defensiva: só
 * chama `.toNumber()` quando o valor de fato o expõe; caso contrário retorna 0.
 * Reusa o padrão de `decimalToNumber` (usado no `score`).
 */
function estimatedCostToNumber(cost: Prisma.Decimal): number {
  return cost.toNumber();
}

/**
 * Agrega os usos de LLM de uma run em uma única visão. Uma run normalmente tem
 * um único uso (GENERATION), mas o schema permite vários; nesse caso, somamos
 * tokens e custo, usamos o maior `latencyMs` e o `model` do primeiro uso.
 * Retorna `null` quando a run não tem nenhum uso registrado.
 */
function toRunUsageView(usages: LlmUsageForTask[]): LlmUsageView | null {
  const first = usages.at(0);
  if (!first) {
    return null;
  }
  return {
    model: first.model,
    promptTokens: sumBy(usages, (usage) => usage.promptTokens),
    completionTokens: sumBy(usages, (usage) => usage.completionTokens),
    totalTokens: sumBy(usages, (usage) => usage.totalTokens),
    latencyMs: usages.reduce((max, usage) => Math.max(max, usage.latencyMs), 0),
    estimatedCost: sumBy(usages, (usage) => estimatedCostToNumber(usage.estimatedCost)),
  };
}

/**
 * Agrega os usos de LLM da avaliação. Mesma lógica de soma da run, mas sem
 * `model` (já exposto no nível da avaliação). Retorna `null` quando não há uso.
 */
function toEvaluationUsageView(usages: LlmUsageForTask[]): EvaluationUsageView | null {
  const first = usages.at(0);
  if (!first) {
    return null;
  }
  return {
    promptTokens: sumBy(usages, (usage) => usage.promptTokens),
    completionTokens: sumBy(usages, (usage) => usage.completionTokens),
    totalTokens: sumBy(usages, (usage) => usage.totalTokens),
    latencyMs: usages.reduce((max, usage) => Math.max(max, usage.latencyMs), 0),
    estimatedCost: sumBy(usages, (usage) => estimatedCostToNumber(usage.estimatedCost)),
  };
}

/**
 * Soma TODOS os usos de LLM da task (todas as runs + avaliação), produzindo o
 * agregado exposto em `llmTotals`. Zeros quando não há nenhum uso.
 */
function buildLlmTotals(task: TaskWithRelations): LlmTotalsView {
  const runUsages = task.generationRuns.flatMap((run) => run.llmUsages);
  const evaluationUsages = task.evaluation?.llmUsages ?? [];
  const all = [...runUsages, ...evaluationUsages];

  return {
    promptTokens: sumBy(all, (usage) => usage.promptTokens),
    completionTokens: sumBy(all, (usage) => usage.completionTokens),
    totalTokens: sumBy(all, (usage) => usage.totalTokens),
    estimatedCost: sumBy(all, (usage) => estimatedCostToNumber(usage.estimatedCost)),
  };
}

/** Soma auxiliar: aplica `selector` a cada item e acumula. */
function sumBy<T>(items: T[], selector: (item: T) => number): number {
  return items.reduce((total, item) => total + selector(item), 0);
}

/**
 * Seleciona o uso de EVALUATION vinculado à avaliação. Filtra pela operação
 * para não misturar eventual uso de outra operação; na prática há um único uso
 * de EVALUATION por avaliação.
 */
function selectEvaluationUsages(usages: LlmUsageForTask[]): LlmUsageForTask[] {
  return usages.filter((usage) => usage.operation === LlmOperation.EVALUATION);
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
export function toTaskEvaluationView(
  evaluation: (TaskEvaluation & { llmUsages: LlmUsageForTask[] }) | null,
): TaskEvaluationView | null {
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
    usage: toEvaluationUsageView(selectEvaluationUsages(evaluation.llmUsages)),
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
