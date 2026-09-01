import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GenerateTaskSpecificationUseCase } from './generate-task-specification.use-case';
import { FakeLlmProvider } from '../infrastructure/fake-llm.provider';
import { TasksRepository } from '../infrastructure/tasks.repository';
import { Task, TaskGenerationRun } from '@prisma/client';

function makeTaskAndRun(): { task: Task; run: TaskGenerationRun } {
  const task = {
    id: 'task-1',
    userId: 'user-1',
    description: 'necessidade',
    status: 'STREAMING',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Task;
  const run = {
    id: 'run-1',
    taskId: 'task-1',
    status: 'RUNNING',
    model: 'pending',
    errorMessage: null,
    startedAt: new Date(),
    finishedAt: null,
  } as TaskGenerationRun;
  return { task, run };
}

describe('GenerateTaskSpecificationUseCase', () => {
  let provider: FakeLlmProvider;
  let repository: {
    createTaskWithRun: ReturnType<typeof vi.fn>;
    completeRun: ReturnType<typeof vi.fn>;
    failRun: ReturnType<typeof vi.fn>;
  };
  let useCase: GenerateTaskSpecificationUseCase;

  beforeEach(() => {
    provider = new FakeLlmProvider();
    repository = {
      createTaskWithRun: vi.fn().mockResolvedValue(makeTaskAndRun()),
      completeRun: vi.fn().mockResolvedValue(undefined),
      failRun: vi.fn().mockResolvedValue(undefined),
    };
    useCase = new GenerateTaskSpecificationUseCase(
      provider,
      repository as unknown as TasksRepository,
    );
  });

  it('gera, valida e persiste a especificação no fluxo de sucesso', async () => {
    const result = await useCase.execute({ userId: 'user-1', description: 'necessidade' });

    expect(result.status).toBe('completed');
    expect(repository.completeRun).toHaveBeenCalledOnce();
    expect(repository.failRun).not.toHaveBeenCalled();
    if (result.status === 'completed') {
      expect(result.specification.title).toBeTruthy();
    }
  });

  it('passa a necessidade do usuário ao provider via mensagens', async () => {
    await useCase.execute({ userId: 'user-1', description: 'adicionar 2FA' });

    expect(provider.receivedRequests).toHaveLength(1);
    const userMsg = provider.receivedRequests[0].messages.find((m) => m.role === 'user');
    expect(userMsg?.content).toContain('adicionar 2FA');
  });

  it('marca a run como falha quando o provider lança erro (sem persistir artefato)', async () => {
    provider.simulateFailure('provider indisponível');

    const result = await useCase.execute({ userId: 'user-1', description: 'x' });

    expect(result.status).toBe('failed');
    expect(repository.failRun).toHaveBeenCalledOnce();
    expect(repository.completeRun).not.toHaveBeenCalled();
    if (result.status === 'failed') {
      expect(result.error).toContain('provider indisponível');
    }
  });

  it('marca a run como falha quando a saída do modelo é inválida (não confia no JSON)', async () => {
    provider.setResponse('desculpe, não consegui gerar');

    const result = await useCase.execute({ userId: 'user-1', description: 'x' });

    expect(result.status).toBe('failed');
    expect(repository.failRun).toHaveBeenCalledOnce();
    expect(repository.completeRun).not.toHaveBeenCalled();
  });

  it('cria a task+run antes de chamar o provider', async () => {
    await useCase.execute({ userId: 'user-1', description: 'x' });

    expect(repository.createTaskWithRun).toHaveBeenCalledOnce();
    expect(repository.createTaskWithRun).toHaveBeenCalledWith('user-1', 'x', expect.any(String));
  });
});
