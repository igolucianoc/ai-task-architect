import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GenerateTaskSpecificationUseCase } from './generate-task-specification.use-case';
import { FakeLlmProvider } from '../infrastructure/fake-llm.provider';
import { TasksRepository } from '../infrastructure/tasks.repository';
import { type TaskGenerationEvent } from './task-generation-events';
import { TaskGenerationRun } from '@prisma/client';

function makeRun(): TaskGenerationRun {
  return {
    id: 'run-1',
    taskId: 'task-1',
    status: 'RUNNING',
    model: 'pending',
    errorMessage: null,
    startedAt: new Date(),
    finishedAt: null,
  };
}

describe('GenerateTaskSpecificationUseCase', () => {
  let provider: FakeLlmProvider;
  let repository: {
    startRun: ReturnType<typeof vi.fn>;
    completeRun: ReturnType<typeof vi.fn>;
    failRun: ReturnType<typeof vi.fn>;
  };
  let useCase: GenerateTaskSpecificationUseCase;

  beforeEach(() => {
    provider = new FakeLlmProvider();
    repository = {
      startRun: vi.fn().mockResolvedValue(makeRun()),
      completeRun: vi.fn().mockResolvedValue(undefined),
      failRun: vi.fn().mockResolvedValue(undefined),
    };
    useCase = new GenerateTaskSpecificationUseCase(
      provider,
      repository as unknown as TasksRepository,
    );
  });

  it('gera, valida e persiste a especificação no fluxo de sucesso', async () => {
    const result = await useCase.execute({
      taskId: 'task-1',
      userId: 'user-1',
      description: 'necessidade',
    });

    expect(result.status).toBe('completed');
    expect(repository.completeRun).toHaveBeenCalledOnce();
    expect(repository.failRun).not.toHaveBeenCalled();
    if (result.status === 'completed') {
      expect(result.specification.title).toBeTruthy();
    }
  });

  it('passa a necessidade do usuário ao provider via mensagens', async () => {
    await useCase.execute({ taskId: 'task-1', userId: 'user-1', description: 'adicionar 2FA' });

    expect(provider.receivedRequests).toHaveLength(1);
    const userMsg = provider.receivedRequests[0].messages.find((m) => m.role === 'user');
    expect(userMsg?.content).toContain('adicionar 2FA');
  });

  it('marca a run como falha quando o provider lança erro (sem persistir artefato)', async () => {
    provider.simulateFailure('provider indisponível');

    const result = await useCase.execute({ taskId: 'task-1', userId: 'user-1', description: 'x' });

    expect(result.status).toBe('failed');
    expect(repository.failRun).toHaveBeenCalledOnce();
    expect(repository.completeRun).not.toHaveBeenCalled();
    if (result.status === 'failed') {
      expect(result.error).toContain('provider indisponível');
    }
  });

  it('marca a run como falha quando a saída do modelo é inválida (não confia no JSON)', async () => {
    provider.setResponse('desculpe, não consegui gerar');

    const result = await useCase.execute({ taskId: 'task-1', userId: 'user-1', description: 'x' });

    expect(result.status).toBe('failed');
    expect(repository.failRun).toHaveBeenCalledOnce();
    expect(repository.completeRun).not.toHaveBeenCalled();
  });

  it('inicia a run para a task existente antes de chamar o provider', async () => {
    await useCase.execute({ taskId: 'task-1', userId: 'user-1', description: 'x' });

    expect(repository.startRun).toHaveBeenCalledOnce();
    expect(repository.startRun).toHaveBeenCalledWith('task-1', expect.any(String));
  });

  it('emite os eventos de progresso na ordem esperada e finaliza com completed', async () => {
    const events: TaskGenerationEvent[] = [];

    const result = await useCase.execute(
      { taskId: 'task-1', userId: 'user-1', description: 'necessidade' },
      (event) => events.push(event),
    );

    expect(result.status).toBe('completed');
    expect(events.map((e) => e.event)).toEqual([
      'started',
      'analyzing_context',
      'generating_requirements',
      'generating_acceptance_criteria',
      'evaluating',
      'completed',
    ]);
    // Todos os eventos compartilham o mesmo runId (= run.id do mock).
    expect(events.every((e) => e.runId === 'run-1')).toBe(true);

    const last = events.at(-1);
    expect(last?.event).toBe('completed');
    if (last?.event === 'completed') {
      expect(last.taskId).toBe('task-1');
      expect(last.specification.title).toBeTruthy();
    }
  });

  it('emite failed como último evento quando o provider lança erro (após started)', async () => {
    provider.simulateFailure('provider indisponível');
    const events: TaskGenerationEvent[] = [];

    const result = await useCase.execute(
      { taskId: 'task-1', userId: 'user-1', description: 'x' },
      (event) => events.push(event),
    );

    expect(result.status).toBe('failed');
    expect(events[0]?.event).toBe('started');
    const last = events.at(-1);
    expect(last?.event).toBe('failed');
    if (last?.event === 'failed') {
      expect(last.error).toContain('provider indisponível');
      expect(last.runId).toBe('run-1');
    }
  });

  it('emite failed como último evento quando a saída do modelo é inválida', async () => {
    provider.setResponse('desculpe, não consegui gerar');
    const events: TaskGenerationEvent[] = [];

    const result = await useCase.execute(
      { taskId: 'task-1', userId: 'user-1', description: 'x' },
      (event) => events.push(event),
    );

    expect(result.status).toBe('failed');
    expect(events.at(-1)?.event).toBe('failed');
  });

  it('mantém o comportamento atual quando execute é chamado sem onEvent', async () => {
    const result = await useCase.execute({
      taskId: 'task-1',
      userId: 'user-1',
      description: 'necessidade',
    });

    expect(result.status).toBe('completed');
    expect(repository.completeRun).toHaveBeenCalledOnce();
  });

  it('não derruba a geração quando o listener lança exceção', async () => {
    const result = await useCase.execute(
      { taskId: 'task-1', userId: 'user-1', description: 'necessidade' },
      () => {
        throw new Error('falha no consumidor de eventos');
      },
    );

    expect(result.status).toBe('completed');
    expect(repository.completeRun).toHaveBeenCalledOnce();
  });
});
