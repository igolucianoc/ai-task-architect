import { Injectable } from '@nestjs/common';
import {
  Task,
  TaskGenerationRun,
  TaskStatus,
  GenerationRunStatus,
  LlmOperation,
  TaskEvaluation,
  EvaluationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TaskSpecification } from '../application/task-specification';
import { LlmUsageMetrics } from '../application/llm-provider.port';
import { EvaluationOutcome } from '../application/task-evaluation';

export interface TaskWithRelations extends Task {
  artifacts: { id: string; content: string; contentFormat: string; createdAt: Date }[];
  generationRuns: Pick<
    TaskGenerationRun,
    'id' | 'status' | 'model' | 'errorMessage' | 'startedAt' | 'finishedAt'
  >[];
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

@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cria a Task apenas com status PENDING, sem run associada. Usado no fluxo
   * B1: `POST /tasks` cria a tarefa e a geração é disparada depois pelo stream.
   */
  createPendingTask(userId: string, description: string): Promise<Task> {
    return this.prisma.task.create({
      data: { userId, description, status: TaskStatus.PENDING },
    });
  }

  /**
   * Inicia uma run (RUNNING) para uma Task já existente e coloca a Task em
   * STREAMING atomicamente. Retorna a run recém-criada. Usado pelo stream SSE
   * ao disparar a geração de uma tarefa PENDING.
   */
  startRun(taskId: string, model: string): Promise<TaskGenerationRun> {
    return this.prisma.$transaction(async (tx) => {
      const run = await tx.taskGenerationRun.create({
        data: { taskId, model, status: GenerationRunStatus.RUNNING },
      });
      await tx.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.STREAMING },
      });
      return run;
    });
  }

  /**
   * Cria a Task (status STREAMING) e a run inicial (RUNNING) atomicamente.
   * Retorna a task e a run recém-criadas. Mantido para compatibilidade; o fluxo
   * B1 usa `createPendingTask` + `startRun` separadamente.
   */
  async createTaskWithRun(
    userId: string,
    description: string,
    model: string,
  ): Promise<{ task: Task; run: TaskGenerationRun }> {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: { userId, description, status: TaskStatus.STREAMING },
      });
      const run = await tx.taskGenerationRun.create({
        data: { taskId: task.id, model, status: GenerationRunStatus.RUNNING },
      });
      return { task, run };
    });
  }

  /**
   * Finaliza uma geração bem-sucedida: run SUCCEEDED, cria o artifact com a
   * especificação validada, registra o uso de tokens e marca a Task COMPLETED.
   * Tudo em uma transação para manter o estado consistente.
   */
  async completeRun(input: SuccessfulRunInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.taskGenerationRun.update({
        where: { id: input.runId },
        data: {
          status: GenerationRunStatus.SUCCEEDED,
          model: input.model,
          finishedAt: new Date(),
        },
      });

      await tx.taskArtifact.create({
        data: {
          taskId: input.taskId,
          generationRunId: input.runId,
          content: JSON.stringify(input.specification),
          contentFormat: 'json',
        },
      });

      if (input.usage) {
        await tx.llmUsage.create({
          data: {
            operation: LlmOperation.GENERATION,
            model: input.model,
            promptTokens: input.usage.promptTokens,
            completionTokens: input.usage.completionTokens,
            totalTokens: input.usage.totalTokens,
            latencyMs: input.latencyMs,
            generationRunId: input.runId,
          },
        });
      }

      await tx.task.update({
        where: { id: input.taskId },
        data: { status: TaskStatus.COMPLETED },
      });
    });
  }

  /**
   * Finaliza uma geração com falha: run FAILED com a mensagem de erro e Task
   * FAILED. Nenhum artifact é criado — não persistimos artefato inválido.
   */
  async failRun(input: FailedRunInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.taskGenerationRun.update({
        where: { id: input.runId },
        data: {
          status: GenerationRunStatus.FAILED,
          errorMessage: input.errorMessage,
          finishedAt: new Date(),
        },
      });
      await tx.task.update({
        where: { id: input.taskId },
        data: { status: TaskStatus.FAILED },
      });
    });
  }

  /**
   * Persiste uma avaliação (LLM-as-Judge) bem-sucedida: upsert da TaskEvaluation
   * por taskId (unique) com status COMPLETED e, quando houver, registra o uso de
   * tokens (operation EVALUATION) vinculado à avaliação. Numa transação. O
   * upsert torna o método idempotente a re-execuções do job de avaliação.
   */
  async saveEvaluationSuccess(input: SaveEvaluationSuccessInput): Promise<void> {
    const { outcome } = input;
    // Guardamos o detalhamento (notas por critério + motivos + score) como JSON
    // para rastreabilidade; as colunas dedicadas guardam os campos consultáveis.
    const dimensions = {
      scores: outcome.scores,
      overallScore: outcome.overallScore,
      reasons: outcome.reasons,
    } satisfies Prisma.InputJsonObject;

    await this.prisma.$transaction(async (tx) => {
      const evaluation = await tx.taskEvaluation.upsert({
        where: { taskId: input.taskId },
        create: {
          taskId: input.taskId,
          status: EvaluationStatus.COMPLETED,
          score: new Prisma.Decimal(outcome.overallScore.toFixed(2)),
          rationale: outcome.rationale,
          dimensions,
          model: input.model,
          result: outcome.result,
          promptVersion: input.promptVersion,
        },
        update: {
          status: EvaluationStatus.COMPLETED,
          score: new Prisma.Decimal(outcome.overallScore.toFixed(2)),
          rationale: outcome.rationale,
          dimensions,
          model: input.model,
          result: outcome.result,
          promptVersion: input.promptVersion,
        },
      });

      if (input.usage) {
        await tx.llmUsage.create({
          data: {
            operation: LlmOperation.EVALUATION,
            model: input.model,
            promptTokens: input.usage.promptTokens,
            completionTokens: input.usage.completionTokens,
            totalTokens: input.usage.totalTokens,
            latencyMs: input.latencyMs,
            evaluationId: evaluation.id,
          },
        });
      }
    });
  }

  /**
   * Persiste uma avaliação indisponível: upsert da TaskEvaluation por taskId com
   * status UNAVAILABLE, guardando o motivo em `rationale`. Não cria artefato nem
   * uso de tokens. Usado quando o juiz falha ou retorna algo não-parseável.
   */
  async saveEvaluationUnavailable(input: SaveEvaluationUnavailableInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.taskEvaluation.upsert({
        where: { taskId: input.taskId },
        create: {
          taskId: input.taskId,
          status: EvaluationStatus.UNAVAILABLE,
          rationale: input.reason,
          result: null,
          score: null,
        },
        update: {
          status: EvaluationStatus.UNAVAILABLE,
          rationale: input.reason,
          result: null,
          score: null,
        },
      });
    });
  }

  /** Leitura da avaliação por taskId (útil para testes/E2E). */
  findEvaluationByTaskId(taskId: string): Promise<TaskEvaluation | null> {
    return this.prisma.taskEvaluation.findUnique({ where: { taskId } });
  }

  findByIdForUser(taskId: string, userId: string): Promise<TaskWithRelations | null> {
    return this.prisma.task.findFirst({
      where: { id: taskId, userId },
      include: {
        artifacts: {
          select: { id: true, content: true, contentFormat: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
        generationRuns: {
          select: {
            id: true,
            status: true,
            model: true,
            errorMessage: true,
            startedAt: true,
            finishedAt: true,
          },
          orderBy: { startedAt: 'desc' },
        },
      },
    });
  }

  async listForUser(
    userId: string,
    skip: number,
    take: number,
  ): Promise<{ items: Task[]; total: number }> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.task.count({ where: { userId } }),
    ]);
    return { items, total };
  }
}
