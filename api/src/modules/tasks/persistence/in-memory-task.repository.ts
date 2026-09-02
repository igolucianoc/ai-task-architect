import { randomUUID } from 'node:crypto';
import {
  Task,
  TaskGenerationRun,
  TaskEvaluation,
  TaskStatus,
  GenerationRunStatus,
  EvaluationStatus,
  LlmOperation,
  QualityGateResult,
  Prisma,
} from '@prisma/client';
import { parseTaskSpecification } from '../domain/task-specification';
import {
  FailedRunInput,
  ITaskRepository,
  LlmUsageForTask,
  SaveEvaluationSuccessInput,
  SaveEvaluationUnavailableInput,
  SuccessfulRunInput,
  TaskEvaluationSource,
  TaskWithRelations,
} from '../domain/task.repository';

interface StoredArtifact {
  id: string;
  content: string;
  contentFormat: string;
  createdAt: Date;
}

interface StoredRun {
  id: string;
  taskId: string;
  status: GenerationRunStatus;
  model: string;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  llmUsages: LlmUsageForTask[];
}

interface StoredEvaluation {
  taskId: string;
  status: EvaluationStatus;
  result: QualityGateResult | null;
  score: Prisma.Decimal | null;
  rationale: string | null;
  dimensions: Prisma.JsonValue;
  model: string | null;
  promptVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
  llmUsages: LlmUsageForTask[];
}

/**
 * In-memory implementation of {@link ITaskRepository} for tests and offline
 * runs. Mirrors the relational shape returned by the Prisma implementation
 * (tasks with their artifacts, generation runs and evaluation). Not intended
 * for production use.
 */
export class InMemoryTaskRepository implements ITaskRepository {
  private readonly tasks = new Map<string, Task>();
  private readonly artifacts = new Map<string, StoredArtifact[]>();
  private readonly runs = new Map<string, StoredRun[]>();
  private readonly evaluations = new Map<string, StoredEvaluation>();

  createPendingTask(userId: string, description: string): Promise<Task> {
    const task = this.buildTask(userId, description, TaskStatus.PENDING);
    this.tasks.set(task.id, task);
    return Promise.resolve(task);
  }

  startRun(taskId: string, model: string): Promise<TaskGenerationRun> {
    const run = this.buildRun(taskId, model);
    this.appendRun(taskId, run);
    this.updateTaskStatus(taskId, TaskStatus.STREAMING);
    return Promise.resolve(this.toPrismaRun(run));
  }

  createTaskWithRun(
    userId: string,
    description: string,
    model: string,
  ): Promise<{ task: Task; run: TaskGenerationRun }> {
    const task = this.buildTask(userId, description, TaskStatus.STREAMING);
    this.tasks.set(task.id, task);
    const run = this.buildRun(task.id, model);
    this.appendRun(task.id, run);
    return Promise.resolve({ task, run: this.toPrismaRun(run) });
  }

  completeRun(input: SuccessfulRunInput): Promise<void> {
    const run = this.findRun(input.taskId, input.runId);
    if (run) {
      run.status = GenerationRunStatus.SUCCEEDED;
      run.model = input.model;
      run.finishedAt = new Date();
      if (input.usage) {
        run.llmUsages.push({
          operation: LlmOperation.GENERATION,
          model: input.model,
          promptTokens: input.usage.promptTokens,
          completionTokens: input.usage.completionTokens,
          totalTokens: input.usage.totalTokens,
          latencyMs: input.latencyMs,
          estimatedCost: new Prisma.Decimal(0),
        });
      }
    }
    this.appendArtifact(input.taskId, {
      id: randomUUID(),
      content: JSON.stringify(input.specification),
      contentFormat: 'json',
      createdAt: new Date(),
    });
    this.updateTaskStatus(input.taskId, TaskStatus.COMPLETED);
    return Promise.resolve();
  }

  failRun(input: FailedRunInput): Promise<void> {
    const run = this.findRun(input.taskId, input.runId);
    if (run) {
      run.status = GenerationRunStatus.FAILED;
      run.errorMessage = input.errorMessage;
      run.finishedAt = new Date();
    }
    this.updateTaskStatus(input.taskId, TaskStatus.FAILED);
    return Promise.resolve();
  }

  saveEvaluationSuccess(input: SaveEvaluationSuccessInput): Promise<void> {
    const now = new Date();
    const existing = this.evaluations.get(input.taskId);
    const evaluation: StoredEvaluation = {
      taskId: input.taskId,
      status: EvaluationStatus.COMPLETED,
      result: input.outcome.result,
      score: new Prisma.Decimal(input.outcome.overallScore.toFixed(2)),
      rationale: input.outcome.rationale,
      dimensions: {
        scores: input.outcome.scores,
        overallScore: input.outcome.overallScore,
        reasons: input.outcome.reasons,
      },
      model: input.model,
      promptVersion: input.promptVersion,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      llmUsages: input.usage
        ? [
            {
              operation: LlmOperation.EVALUATION,
              model: input.model,
              promptTokens: input.usage.promptTokens,
              completionTokens: input.usage.completionTokens,
              totalTokens: input.usage.totalTokens,
              latencyMs: input.latencyMs,
              estimatedCost: new Prisma.Decimal(0),
            },
          ]
        : [],
    };
    this.evaluations.set(input.taskId, evaluation);
    return Promise.resolve();
  }

  saveEvaluationUnavailable(input: SaveEvaluationUnavailableInput): Promise<void> {
    const now = new Date();
    const existing = this.evaluations.get(input.taskId);
    this.evaluations.set(input.taskId, {
      taskId: input.taskId,
      status: EvaluationStatus.UNAVAILABLE,
      result: null,
      score: null,
      rationale: input.reason,
      dimensions: existing?.dimensions ?? null,
      model: existing?.model ?? null,
      promptVersion: existing?.promptVersion ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      llmUsages: [],
    });
    return Promise.resolve();
  }

  findEvaluationByTaskId(taskId: string): Promise<TaskEvaluation | null> {
    const stored = this.evaluations.get(taskId);
    return Promise.resolve(stored ? this.toPrismaEvaluation(stored) : null);
  }

  findTaskWithArtifactById(taskId: string): Promise<TaskEvaluationSource | null> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return Promise.resolve(null);
    }
    const artifact = this.latestArtifact(taskId);
    if (!artifact) {
      return Promise.resolve(null);
    }
    const parsed = parseTaskSpecification(artifact.content);
    if (!parsed.success) {
      return Promise.resolve(null);
    }
    return Promise.resolve({ description: task.description, specification: parsed.data });
  }

  findByIdForUser(taskId: string, userId: string): Promise<TaskWithRelations | null> {
    const task = this.tasks.get(taskId);
    if (!task || task.userId !== userId) {
      return Promise.resolve(null);
    }

    const artifacts = [...(this.artifacts.get(taskId) ?? [])].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const generationRuns = [...(this.runs.get(taskId) ?? [])]
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .map((run) => ({
        id: run.id,
        status: run.status,
        model: run.model,
        errorMessage: run.errorMessage,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        llmUsages: run.llmUsages,
      }));
    const storedEvaluation = this.evaluations.get(taskId);

    const relations: TaskWithRelations = {
      ...task,
      artifacts: artifacts.map((a) => ({
        id: a.id,
        content: a.content,
        contentFormat: a.contentFormat,
        createdAt: a.createdAt,
      })),
      generationRuns,
      evaluation: storedEvaluation
        ? { ...this.toPrismaEvaluation(storedEvaluation), llmUsages: storedEvaluation.llmUsages }
        : null,
    };
    return Promise.resolve(relations);
  }

  deleteForUser(taskId: string, userId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.userId !== userId) {
      return Promise.resolve(false);
    }
    this.tasks.delete(taskId);
    this.artifacts.delete(taskId);
    this.runs.delete(taskId);
    this.evaluations.delete(taskId);
    return Promise.resolve(true);
  }

  listForUser(
    userId: string,
    skip: number,
    take: number,
  ): Promise<{ items: Task[]; total: number }> {
    const all = [...this.tasks.values()]
      .filter((task) => task.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return Promise.resolve({ items: all.slice(skip, skip + take), total: all.length });
  }

  private buildTask(userId: string, description: string, status: TaskStatus): Task {
    const now = new Date();
    return { id: randomUUID(), userId, description, status, createdAt: now, updatedAt: now };
  }

  private buildRun(taskId: string, model: string): StoredRun {
    return {
      id: randomUUID(),
      taskId,
      status: GenerationRunStatus.RUNNING,
      model,
      errorMessage: null,
      startedAt: new Date(),
      finishedAt: null,
      llmUsages: [],
    };
  }

  private appendRun(taskId: string, run: StoredRun): void {
    const existing = this.runs.get(taskId) ?? [];
    existing.push(run);
    this.runs.set(taskId, existing);
  }

  private appendArtifact(taskId: string, artifact: StoredArtifact): void {
    const existing = this.artifacts.get(taskId) ?? [];
    existing.push(artifact);
    this.artifacts.set(taskId, existing);
  }

  private findRun(taskId: string, runId: string): StoredRun | undefined {
    return (this.runs.get(taskId) ?? []).find((run) => run.id === runId);
  }

  private latestArtifact(taskId: string): StoredArtifact | undefined {
    return [...(this.artifacts.get(taskId) ?? [])].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    )[0];
  }

  private updateTaskStatus(taskId: string, status: TaskStatus): void {
    const task = this.tasks.get(taskId);
    if (task) {
      this.tasks.set(taskId, { ...task, status, updatedAt: new Date() });
    }
  }

  private toPrismaRun(run: StoredRun): TaskGenerationRun {
    return {
      id: run.id,
      taskId: run.taskId,
      status: run.status,
      model: run.model,
      errorMessage: run.errorMessage,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    };
  }

  private toPrismaEvaluation(stored: StoredEvaluation): TaskEvaluation {
    return {
      id: stored.taskId,
      taskId: stored.taskId,
      status: stored.status,
      result: stored.result,
      score: stored.score,
      rationale: stored.rationale,
      dimensions: stored.dimensions,
      model: stored.model,
      promptVersion: stored.promptVersion,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    };
  }
}
