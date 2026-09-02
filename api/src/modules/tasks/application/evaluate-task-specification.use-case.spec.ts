import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClsService } from 'nestjs-cls';
import { EvaluateTaskSpecificationUseCase } from './evaluate-task-specification.use-case';
import { FakeLlmProvider } from '../infrastructure/fake-llm.provider';
import { TasksRepository } from '../infrastructure/tasks.repository';
import { AppLogger } from '../../../common/observability/app-logger';
import { type TaskSpecification } from './task-specification';

/** Logger estruturado mockado — só precisamos que os métodos existam e não quebrem. */
function makeLogger(): AppLogger {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  } as unknown as AppLogger;
}

/** ClsService mockado: sem contexto ativo por padrão (correlationId = undefined). */
function makeCls(): ClsService {
  return {
    isActive: vi.fn().mockReturnValue(false),
    get: vi.fn().mockReturnValue(undefined),
    set: vi.fn(),
    run: vi.fn((cb: () => unknown) => cb()),
  } as unknown as ClsService;
}

function makeSpecification(): TaskSpecification {
  return {
    title: 'Especificação de exemplo',
    context: 'Contexto de exemplo para avaliação.',
    objective: 'Objetivo de exemplo.',
    functionalRequirements: ['Requisito funcional de exemplo'],
    nonFunctionalRequirements: ['Requisito não-funcional de exemplo'],
    acceptanceCriteria: ['Critério de aceite de exemplo'],
    technicalTasks: ['Tarefa técnica de exemplo'],
    risks: ['Risco de exemplo'],
    dependencies: ['Dependência de exemplo'],
    definitionOfDone: ['DoD de exemplo'],
  };
}

describe('EvaluateTaskSpecificationUseCase', () => {
  let provider: FakeLlmProvider;
  let repository: {
    saveEvaluationSuccess: ReturnType<typeof vi.fn>;
    saveEvaluationUnavailable: ReturnType<typeof vi.fn>;
  };
  let useCase: EvaluateTaskSpecificationUseCase;

  beforeEach(() => {
    provider = new FakeLlmProvider(FakeLlmProvider.defaultJudgeJson());
    repository = {
      saveEvaluationSuccess: vi.fn().mockResolvedValue(undefined),
      saveEvaluationUnavailable: vi.fn().mockResolvedValue(undefined),
    };
    useCase = new EvaluateTaskSpecificationUseCase(
      provider,
      repository as unknown as TasksRepository,
      makeLogger(),
      makeCls(),
    );
  });

  it('aprova a especificação e persiste a avaliação no fluxo de sucesso (APPROVED)', async () => {
    const result = await useCase.execute({
      taskId: 'task-1',
      description: 'necessidade',
      specification: makeSpecification(),
    });

    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.result).toBe('APPROVED');
      expect(result.overallScore).toBeGreaterThanOrEqual(7);
    }
    expect(repository.saveEvaluationSuccess).toHaveBeenCalledOnce();
    expect(repository.saveEvaluationUnavailable).not.toHaveBeenCalled();

    // Persistência recebe promptVersion e o model reportado pelo provider.
    const saved: unknown = repository.saveEvaluationSuccess.mock.calls[0][0];
    expect(saved).toMatchObject({
      taskId: 'task-1',
      promptVersion: 'judge-v1',
      model: 'fake-model',
    });
  });

  it('reprova a especificação quando as notas são baixas (REJECTED)', async () => {
    provider.setResponse(
      FakeLlmProvider.defaultJudgeJson({
        clarity: 4,
        completeness: 4,
        consistency: 4,
        testability: 4,
        risks: 4,
        requirementsAdherence: 4,
      }),
    );

    const result = await useCase.execute({
      taskId: 'task-1',
      description: 'necessidade',
      specification: makeSpecification(),
    });

    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.result).toBe('REJECTED');
    }
    expect(repository.saveEvaluationSuccess).toHaveBeenCalledOnce();
    expect(repository.saveEvaluationUnavailable).not.toHaveBeenCalled();
  });

  it('marca a avaliação como indisponível quando a saída do juiz é inválida', async () => {
    provider.setResponse('nao é json');

    const result = await useCase.execute({
      taskId: 'task-1',
      description: 'necessidade',
      specification: makeSpecification(),
    });

    expect(result.status).toBe('unavailable');
    expect(repository.saveEvaluationUnavailable).toHaveBeenCalledOnce();
    expect(repository.saveEvaluationSuccess).not.toHaveBeenCalled();
  });

  it('marca a avaliação como indisponível quando o provider lança erro', async () => {
    provider.simulateFailure('juiz indisponível');

    const result = await useCase.execute({
      taskId: 'task-1',
      description: 'necessidade',
      specification: makeSpecification(),
    });

    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') {
      expect(result.reason).toContain('juiz indisponível');
    }
    expect(repository.saveEvaluationUnavailable).toHaveBeenCalledOnce();
    expect(repository.saveEvaluationSuccess).not.toHaveBeenCalled();
  });

  it('usa buildJudgeMessages: request contém a description e o JSON da specification', async () => {
    const specification = makeSpecification();
    await useCase.execute({ taskId: 'task-1', description: 'adicionar 2FA', specification });

    expect(provider.receivedRequests).toHaveLength(1);
    const request = provider.receivedRequests[0];
    expect(request.temperature).toBe(0);

    const userMsg = request.messages.find((m) => m.role === 'user');
    expect(userMsg?.content).toContain('adicionar 2FA');
    // A specification é serializada como JSON na user message.
    expect(userMsg?.content).toContain(specification.title);
    expect(userMsg?.content).toContain('"functionalRequirements"');
  });

  it('inclui o correlationId do CLS no log estruturado de sucesso', async () => {
    const logger = makeLogger();
    const cls = {
      isActive: vi.fn().mockReturnValue(true),
      get: vi.fn().mockReturnValue('corr-999'),
      set: vi.fn(),
      run: vi.fn((cb: () => unknown) => cb()),
    } as unknown as ClsService;
    useCase = new EvaluateTaskSpecificationUseCase(
      provider,
      repository as unknown as TasksRepository,
      logger,
      cls,
    );

    await useCase.execute({
      taskId: 'task-1',
      description: 'necessidade',
      specification: makeSpecification(),
    });

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('avaliação concluída'),
      EvaluateTaskSpecificationUseCase.name,
      expect.objectContaining({
        operation: 'evaluation',
        correlationId: 'corr-999',
        promptVersion: 'judge-v1',
      }),
    );
  });
});
