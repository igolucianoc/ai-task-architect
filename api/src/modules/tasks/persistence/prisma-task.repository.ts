import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
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
import { PrismaService } from '../../../infra/database/prisma/prisma.service';
import { appConfig } from '../../../core/config/app.config';
import { parseTaskSpecification } from '../domain/task-specification';
import { LlmUsageMetrics } from '../domain/llm-provider.port';
import { estimateLlmCost, type LlmCostRates } from '../application/llm-cost';
import {
  FailedRunInput,
  ITaskRepository,
  SaveEvaluationSuccessInput,
  SaveEvaluationUnavailableInput,
  SuccessfulRunInput,
  TaskEvaluationSource,
  TaskWithRelations,
} from '../domain/task.repository';

@Injectable()
export class PrismaTaskRepository implements ITaskRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  /**
   * Calcula o custo estimado do uso de tokens como Decimal, a partir das rates
   * configuradas (default 0 → custo neutro). Centraliza a conversão para os
   * pontos que persistem LlmUsage (geração e avaliação).
   */
  private buildEstimatedCost(usage: LlmUsageMetrics): Prisma.Decimal {
    const rates: LlmCostRates = {
      pricePer1kPromptTokens: this.config.llmCostPer1kPromptTokens,
      pricePer1kCompletionTokens: this.config.llmCostPer1kCompletionTokens,
    };
    const cost = estimateLlmCost(usage, rates);
    return new Prisma.Decimal(cost.toFixed(6));
  }

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
            estimatedCost: this.buildEstimatedCost(input.usage),
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
            estimatedCost: this.buildEstimatedCost(input.usage),
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

  /**
   * Carrega a task e reidrata sua especificação a partir do último artifact,
   * para o worker de avaliação. O `parse` é defensivo (a saída original do LLM
   * já foi validada na geração, mas não confiamos cegamente no conteúdo em
   * disco): retorna `null` se a task não existir, não tiver artifact ou o
   * conteúdo não for uma especificação válida — evitando retry infinito de dado
   * inválido no BullMQ.
   */
  async findTaskWithArtifactById(taskId: string): Promise<TaskEvaluationSource | null> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        artifacts: {
          select: { content: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!task) {
      return null;
    }

    const artifact = task.artifacts.at(0);
    if (!artifact) {
      return null;
    }

    const parsed = parseTaskSpecification(artifact.content);
    if (!parsed.success) {
      return null;
    }

    return { description: task.description, specification: parsed.data };
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
            // Uso de LLM da run (normalmente 1 de GENERATION) para expor tokens,
            // latência e custo na observabilidade.
            llmUsages: {
              select: {
                operation: true,
                model: true,
                promptTokens: true,
                completionTokens: true,
                totalTokens: true,
                latencyMs: true,
                estimatedCost: true,
              },
            },
          },
          orderBy: { startedAt: 'desc' },
        },
        // A avaliação é obtida por este GET (não pelo stream): o worker de
        // avaliação a persiste de forma assíncrona após a geração concluir.
        // `include` traz todos os campos escalares da avaliação (usados pelo
        // presenter) mais os usos de LLM (operation EVALUATION) vinculados.
        evaluation: {
          include: {
            llmUsages: {
              select: {
                operation: true,
                model: true,
                promptTokens: true,
                completionTokens: true,
                totalTokens: true,
                latencyMs: true,
                estimatedCost: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Exclui uma tarefa do usuário e todos os seus filhos (runs, artifacts,
   * avaliação e usos de token) via cascade definido no schema. Retorna `true`
   * se algo foi excluído e `false` se a tarefa não existir ou não pertencer ao
   * usuário — permitindo ao chamador responder 404 sem vazar existência.
   */
  async deleteForUser(taskId: string, userId: string): Promise<boolean> {
    const result = await this.prisma.task.deleteMany({
      where: { id: taskId, userId },
    });
    return result.count > 0;
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
