import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, UnauthorizedException, type MessageEvent } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { firstValueFrom, toArray } from 'rxjs';
import { TaskStatus } from '@prisma/client';
import { TasksController } from './tasks.controller';
import { GenerateTaskSpecificationUseCase } from '../application/generate-task-specification.use-case';
import { TasksRepository, TaskWithRelations } from '../infrastructure/tasks.repository';
import { EvaluationQueue } from '../infrastructure/evaluation.queue';
import { AuthenticatedUser } from '../../auth/infrastructure/jwt.strategy';
import { buildEvent, type TaskGenerationEvent } from '../application/task-generation-events';
import { type TaskSpecification } from '../application/task-specification';

const USER: AuthenticatedUser = {
  id: 'user-1',
  email: 'user@example.com',
  displayName: 'Usuário',
};

const SPEC: TaskSpecification = {
  title: 'Título',
  context: 'Contexto',
  objective: 'Objetivo',
  functionalRequirements: ['req'],
  nonFunctionalRequirements: [],
  acceptanceCriteria: ['critério'],
  technicalTasks: [],
  risks: [],
  dependencies: [],
  definitionOfDone: [],
};

/** Cria uma task com relações, permitindo sobrescrever status/artifacts/runs. */
function makeTask(overrides: Partial<TaskWithRelations> = {}): TaskWithRelations {
  return {
    id: 'task-1',
    userId: 'user-1',
    description: 'uma descrição de tarefa com mais de cinquenta caracteres exigidos',
    status: TaskStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
    artifacts: [],
    generationRuns: [],
    ...overrides,
  };
}

/** Coleta todos os eventos emitidos pelo Observable de SSE. */
async function collect(observable: { subscribe: unknown }): Promise<TaskGenerationEvent[]> {
  const messages = await firstValueFrom(
    (observable as import('rxjs').Observable<MessageEvent>).pipe(toArray()),
  );
  return messages.map((m) => JSON.parse(m.data as string) as TaskGenerationEvent);
}

describe('TasksController', () => {
  let generateTask: { execute: ReturnType<typeof vi.fn> };
  let repository: {
    createPendingTask: ReturnType<typeof vi.fn>;
    findByIdForUser: ReturnType<typeof vi.fn>;
    listForUser: ReturnType<typeof vi.fn>;
  };
  let jwt: { verify: ReturnType<typeof vi.fn> };
  let evaluationQueue: { enqueue: ReturnType<typeof vi.fn> };
  let controller: TasksController;

  beforeEach(() => {
    generateTask = { execute: vi.fn() };
    repository = {
      createPendingTask: vi.fn(),
      findByIdForUser: vi.fn(),
      listForUser: vi.fn(),
    };
    jwt = { verify: vi.fn() };
    evaluationQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    controller = new TasksController(
      generateTask as unknown as GenerateTaskSpecificationUseCase,
      repository as unknown as TasksRepository,
      jwt as unknown as JwtService,
      { jwtSecret: 'segredo-de-teste-com-32-caracteres-ok' } as never,
      evaluationQueue as unknown as EvaluationQueue,
    );
  });

  describe('POST /tasks', () => {
    it('cria a tarefa PENDING e retorna taskId e status (sem gerar)', async () => {
      repository.createPendingTask.mockResolvedValue({ id: 'task-1', status: TaskStatus.PENDING });

      const result = await controller.create({ description: 'x'.repeat(60) }, USER);

      expect(result).toEqual({ taskId: 'task-1', status: TaskStatus.PENDING });
      expect(repository.createPendingTask).toHaveBeenCalledWith('user-1', 'x'.repeat(60));
      expect(generateTask.execute).not.toHaveBeenCalled();
    });
  });

  describe('GET /tasks/:id/stream', () => {
    it('rejeita com 401 quando o token está ausente', async () => {
      await expect(controller.stream('task-1', undefined)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejeita com 401 quando o token é inválido', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('jwt malformed');
      });

      await expect(controller.stream('task-1', 'token-ruim')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('retorna 404 quando a tarefa não é do usuário', async () => {
      jwt.verify.mockReturnValue({ sub: 'user-1', email: 'user@example.com' });
      repository.findByIdForUser.mockResolvedValue(null);

      await expect(controller.stream('task-1', 'ok')).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.findByIdForUser).toHaveBeenCalledWith('task-1', 'user-1');
    });

    it('dispara a geração quando a tarefa está PENDING', async () => {
      jwt.verify.mockReturnValue({ sub: 'user-1', email: 'user@example.com' });
      repository.findByIdForUser.mockResolvedValue(makeTask({ status: TaskStatus.PENDING }));
      generateTask.execute.mockImplementation(
        (_input: unknown, onEvent: (e: TaskGenerationEvent) => void): Promise<void> => {
          onEvent(buildEvent({ event: 'started', runId: 'run-1' }));
          onEvent(
            buildEvent({
              event: 'completed',
              runId: 'run-1',
              taskId: 'task-1',
              specification: SPEC,
            }),
          );
          return Promise.resolve();
        },
      );

      const observable = await controller.stream('task-1', 'ok');
      const events = await collect(observable);

      expect(generateTask.execute).toHaveBeenCalledOnce();
      expect(events.map((e) => e.event)).toEqual(['started', 'completed']);
      // Ao concluir a geração, a avaliação assíncrona é enfileirada com o taskId.
      expect(evaluationQueue.enqueue).toHaveBeenCalledWith({ taskId: 'task-1' });
    });

    it('não enfileira avaliação quando a geração falha', async () => {
      jwt.verify.mockReturnValue({ sub: 'user-1', email: 'user@example.com' });
      repository.findByIdForUser.mockResolvedValue(makeTask({ status: TaskStatus.PENDING }));
      generateTask.execute.mockImplementation(
        (_input: unknown, onEvent: (e: TaskGenerationEvent) => void): Promise<void> => {
          onEvent(buildEvent({ event: 'started', runId: 'run-1' }));
          onEvent(
            buildEvent({
              event: 'failed',
              runId: 'run-1',
              taskId: 'task-1',
              error: 'provider caiu',
            }),
          );
          return Promise.resolve();
        },
      );

      const observable = await controller.stream('task-1', 'ok');
      const events = await collect(observable);

      expect(events.map((e) => e.event)).toEqual(['started', 'failed']);
      expect(evaluationQueue.enqueue).not.toHaveBeenCalled();
    });

    it('reemite completed com a especificação reidratada quando já COMPLETED', async () => {
      jwt.verify.mockReturnValue({ sub: 'user-1', email: 'user@example.com' });
      repository.findByIdForUser.mockResolvedValue(
        makeTask({
          status: TaskStatus.COMPLETED,
          artifacts: [
            {
              id: 'a-1',
              content: JSON.stringify(SPEC),
              contentFormat: 'json',
              createdAt: new Date(),
            },
          ],
          generationRuns: [
            {
              id: 'run-1',
              status: 'SUCCEEDED',
              model: 'fake',
              errorMessage: null,
              startedAt: new Date(),
              finishedAt: new Date(),
            },
          ],
        }),
      );

      const observable = await controller.stream('task-1', 'ok');
      const events = await collect(observable);

      expect(generateTask.execute).not.toHaveBeenCalled();
      expect(events).toHaveLength(1);
      const [event] = events;
      expect(event.event).toBe('completed');
      if (event.event === 'completed') {
        expect(event.specification.title).toBe('Título');
      }
    });

    it('reemite failed com o erro registrado quando já FAILED', async () => {
      jwt.verify.mockReturnValue({ sub: 'user-1', email: 'user@example.com' });
      repository.findByIdForUser.mockResolvedValue(
        makeTask({
          status: TaskStatus.FAILED,
          generationRuns: [
            {
              id: 'run-1',
              status: 'FAILED',
              model: 'fake',
              errorMessage: 'provider caiu',
              startedAt: new Date(),
              finishedAt: new Date(),
            },
          ],
        }),
      );

      const observable = await controller.stream('task-1', 'ok');
      const events = await collect(observable);

      expect(generateTask.execute).not.toHaveBeenCalled();
      expect(events).toHaveLength(1);
      const [event] = events;
      expect(event.event).toBe('failed');
      if (event.event === 'failed') {
        expect(event.error).toBe('provider caiu');
      }
    });

    it('emite failed sem regenerar quando já está STREAMING', async () => {
      jwt.verify.mockReturnValue({ sub: 'user-1', email: 'user@example.com' });
      repository.findByIdForUser.mockResolvedValue(makeTask({ status: TaskStatus.STREAMING }));

      const observable = await controller.stream('task-1', 'ok');
      const events = await collect(observable);

      expect(generateTask.execute).not.toHaveBeenCalled();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('failed');
    });
  });
});
