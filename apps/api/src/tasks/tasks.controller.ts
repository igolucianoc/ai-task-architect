import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ParseUUIDPipe,
  UsePipes,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { GenerateTaskSpecificationUseCase } from './use-cases/generate-task-specification.use-case';
import { TasksRepository } from './tasks.repository';
import {
  createTaskSchema,
  CreateTaskDto,
  listTasksQuerySchema,
  ListTasksQueryDto,
} from './dto/create-task.schema';
import { toTaskDetail, toTaskSummary, TaskDetailView, TaskSummaryView } from './tasks.presenter';

interface PaginatedTasks {
  items: TaskSummaryView[];
  page: number;
  pageSize: number;
  total: number;
}

@Controller('tasks')
export class TasksController {
  constructor(
    private readonly generateTask: GenerateTaskSpecificationUseCase,
    private readonly repository: TasksRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(createTaskSchema))
  async create(
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TaskDetailView> {
    const result = await this.generateTask.execute({
      userId: user.id,
      description: dto.description,
    });

    const task = await this.repository.findByIdForUser(result.taskId, user.id);
    if (!task) {
      throw new NotFoundException('Tarefa não encontrada após a geração');
    }
    return toTaskDetail(task);
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
}
