import {
  Controller,
  Post,
  Get,
  Delete,
  Sse,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
  ParseUUIDPipe,
  Logger,
  Inject,
  type MessageEvent,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigType } from '@nestjs/config';
import { Observable, ReplaySubject, defer, from } from 'rxjs';
import { TaskStatus } from '@prisma/client';
import { appConfig } from '../../../core/config/app.config';
import { Public } from '../../auth/presentation/http/public.decorator';
import { CurrentUser } from '../../auth/presentation/http/current-user.decorator';
import { AuthenticatedUser } from '../../auth/presentation/http/jwt.strategy';
import { AccessTokenPayload } from '../../auth/application/token.service';
import { ZodValidationPipe } from '../../../infra/http/zod-validation.pipe';
import { GenerateTaskSpecificationUseCase } from '../application/generate-task-specification.use-case';
import { ITaskRepository, TASK_REPOSITORY, TaskWithRelations } from '../domain/task.repository';
import { EvaluationQueue } from '../infra/evaluation.queue';
import {
  buildEvent,
  isTerminalEvent,
  type TaskGenerationEvent,
} from '../domain/task-generation-events';
import {
  createTaskSchema,
  CreateTaskDto,
  listTasksQuerySchema,
  ListTasksQueryDto,
} from './schemas/create-task.schema';
import {
  toTaskCreated,
  toTaskDetail,
  toTaskSummary,
  parseArtifactContent,
  TaskCreatedView,
  TaskDetailView,
  TaskSummaryView,
} from './tasks.presenter';

interface PaginatedTasks {
  items: TaskSummaryView[];
  page: number;
  pageSize: number;
  total: number;
}

/** Tempo máximo de uma geração antes de encerrar o stream com erro. */
const STREAM_TIMEOUT_MS = 90_000;

@Controller('tasks')
export class TasksController {
  private readonly logger = new Logger(TasksController.name);

  constructor(
    private readonly generateTask: GenerateTaskSpecificationUseCase,
    @Inject(TASK_REPOSITORY) private readonly repository: ITaskRepository,
    private readonly jwt: JwtService,
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
    private readonly evaluationQueue: EvaluationQueue,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createTaskSchema)) dto: CreateTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TaskCreatedView> {
    // Fluxo B1: apenas cria a tarefa PENDING. A geração é disparada depois pelo
    // stream (`GET /tasks/:id/stream`).
    const task = await this.repository.createPendingTask(user.id, dto.description);
    return toTaskCreated(task);
  }

  @Get()
  async list(
    @Query(new ZodValidationPipe(listTasksQuerySchema)) query: ListTasksQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedTasks> {
    const skip = (query.page - 1) * query.pageSize;
    const { items, total } = await this.repository.listForUser(user.id, skip, query.pageSize);

    return {
      items: items.map(toTaskSummary),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  /**
   * Dispara a geração e transmite o progresso via Server-Sent Events.
   *
   * Rota pública para o guard JWT (o `EventSource` nativo não envia o header
   * Authorization — ver ADR-005); a autenticação é feita manualmente aqui,
   * validando o access token recebido na query string (`?token=...`).
   *
   * Seleção de estado por status da tarefa:
   * - PENDING: dispara a geração e emite os eventos em tempo real.
   * - COMPLETED: reemite um `completed` com a especificação reidratada.
   * - FAILED: reemite um `failed` com o erro registrado.
   * - STREAMING: já existe uma geração em andamento; emite `failed` orientando
   *   a não disparar de novo (evita geração concorrente/duplicada).
   */
  @Public()
  @Sse(':id/stream')
  async stream(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('token') token?: string,
  ): Promise<Observable<MessageEvent>> {
    const userId = this.authenticate(token);
    const task = await this.repository.findByIdForUser(id, userId);
    if (!task) {
      throw new NotFoundException('Tarefa não encontrada');
    }

    if (task.status !== TaskStatus.PENDING) {
      // Estado não-PENDING: reemite o estado terminal já conhecido. `from` só
      // emite ao ser assinado, então os eventos nunca se perdem.
      const events = this.buildTerminalEvents(task);
      return from(events.map((event) => this.toMessage(event)));
    }

    // PENDING: dispara a geração ao ser assinado (o Nest assina o Observable ao
    // abrir o SSE). `defer` garante que o trabalho só comece na assinatura.
    return defer(() => {
      // ReplaySubject bufferiza os eventos: se algum for emitido antes de o
      // transporte assinar, ele não se perde ao anexar a assinatura.
      const subject = new ReplaySubject<MessageEvent>();
      this.runGeneration(task, userId, subject);
      return subject.asObservable();
    });
  }

  @Get(':id')
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TaskDetailView> {
    const task = await this.repository.findByIdForUser(id, user.id);
    if (!task) {
      throw new NotFoundException('Tarefa não encontrada');
    }
    return toTaskDetail(task);
  }

  /**
   * Exclui uma tarefa do usuário autenticado, com todos os seus filhos
   * (cascade). Responde 204 sem corpo em caso de sucesso e 404 quando a tarefa
   * não existe ou não pertence ao usuário.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const deleted = await this.repository.deleteForUser(id, user.id);
    if (!deleted) {
      throw new NotFoundException('Tarefa não encontrada');
    }
  }

  /**
   * Valida o access token da query string e retorna o id do usuário (`sub`).
   * Lança 401 se ausente ou inválido. Nunca loga o token.
   */
  private authenticate(token?: string): string {
    if (!token) {
      throw new UnauthorizedException('Token de acesso ausente');
    }
    try {
      const payload = this.jwt.verify<AccessTokenPayload>(token, {
        secret: this.config.jwtSecret,
      });
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Token de acesso inválido');
    }
  }

  /**
   * Dispara a geração para uma tarefa PENDING, empurrando cada evento para o
   * stream. Fecha o subject no evento terminal ou ao estourar o timeout.
   *
   * Limitação conhecida: o `execute` aguarda a chamada ao LLM, que não é
   * cancelável. Se o cliente desconectar antes do término, encerramos o subject
   * para não vazar recursos do stream, mas a chamada em andamento ao provider
   * segue até concluir (o resultado é persistido normalmente pelo use-case).
   */
  private runGeneration(
    task: TaskWithRelations,
    userId: string,
    subject: ReplaySubject<MessageEvent>,
  ): void {
    let settled = false;

    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      subject.complete();
    };

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      // Timeout: informa o cliente e encerra. A run pode ser finalizada pelo
      // use-case posteriormente; aqui apenas paramos de transmitir.
      this.push(
        subject,
        buildEvent({
          event: 'failed',
          runId: task.id,
          taskId: task.id,
          error: 'timeout',
        }),
      );
      finish();
    }, STREAM_TIMEOUT_MS);

    // Ao desconectar, o cliente completa/erra o subscribe; garantimos cleanup.
    subject.subscribe({
      error: () => {
        clearTimeout(timer);
        settled = true;
      },
    });

    void this.generateTask
      .execute({ taskId: task.id, userId, description: task.description }, (event) => {
        if (settled) {
          return;
        }
        this.push(subject, event);
        if (event.event === 'completed') {
          // Geração concluída com sucesso: enfileira a avaliação assíncrona
          // (LLM-as-Judge — ADR-006). NÃO enfileiramos para tarefas que falharam.
          this.enqueueEvaluation(task.id);
        }
        if (isTerminalEvent(event)) {
          finish();
        }
      })
      .catch((error: unknown) => {
        // Salvaguarda: o use-case já trata erros e emite `failed`. Este catch
        // cobre falhas inesperadas fora do fluxo de eventos.
        const message = error instanceof Error ? error.message : 'erro desconhecido';
        this.logger.error(`stream taskId=${task.id} falhou: ${message}`);
        if (!settled) {
          this.push(
            subject,
            buildEvent({ event: 'failed', runId: task.id, taskId: task.id, error: message }),
          );
          finish();
        }
      });
  }

  /**
   * Enfileira a avaliação sem bloquear/derrubar o stream. O enqueue é
   * fire-and-forget: uma falha ao enfileirar (ex.: Redis momentaneamente
   * indisponível) é apenas logada — não interrompe a entrega do resultado da
   * geração ao usuário. O jobId determinístico (= taskId) evita duplicar a
   * avaliação se o stream for reaberto.
   */
  private enqueueEvaluation(taskId: string): void {
    void this.evaluationQueue.enqueue({ taskId }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'erro desconhecido';
      this.logger.error(`falha ao enfileirar avaliação taskId=${taskId}: ${message}`);
    });
  }

  /**
   * Para tarefas não-PENDING: constrói o(s) evento(s) do estado terminal já
   * conhecido em vez de regenerar. COMPLETED reidrata a especificação do
   * artifact; FAILED reemite o erro; STREAMING sinaliza que já há geração em
   * andamento.
   */
  private buildTerminalEvents(task: TaskWithRelations): TaskGenerationEvent[] {
    const latestRun = task.generationRuns.at(0);
    const runId = latestRun?.id ?? task.id;

    if (task.status === TaskStatus.COMPLETED) {
      const artifact = task.artifacts.at(0);
      const specification = artifact ? parseArtifactContent(artifact.content) : null;
      if (specification) {
        return [buildEvent({ event: 'completed', runId, taskId: task.id, specification })];
      }
      return [
        buildEvent({
          event: 'failed',
          runId,
          taskId: task.id,
          error: 'especificação indisponível',
        }),
      ];
    }

    if (task.status === TaskStatus.FAILED) {
      return [
        buildEvent({
          event: 'failed',
          runId,
          taskId: task.id,
          error: latestRun?.errorMessage ?? 'geração anterior falhou',
        }),
      ];
    }

    // STREAMING: já há uma geração em andamento — não disparamos outra.
    return [
      buildEvent({ event: 'failed', runId, taskId: task.id, error: 'geração já em andamento' }),
    ];
  }

  /**
   * Empurra um evento para o stream, serializado como `MessageEvent` de SSE.
   */
  private push(subject: ReplaySubject<MessageEvent>, event: TaskGenerationEvent): void {
    subject.next(this.toMessage(event));
  }

  /**
   * Serializa o evento como `MessageEvent` de SSE: `data` com o JSON do evento e
   * `type` com o nome do evento (usado como nome do evento SSE pelo cliente).
   */
  private toMessage(event: TaskGenerationEvent): MessageEvent {
    return { data: JSON.stringify(event), type: event.event };
  }
}
