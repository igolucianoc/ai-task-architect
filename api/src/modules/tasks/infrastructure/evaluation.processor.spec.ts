import { describe, it, expect, beforeEach, vi } from 'vitest';
import { type Job } from 'bullmq';
import { EvaluationProcessor } from './evaluation.processor';
import { EvaluateTaskSpecificationUseCase } from '../application/evaluate-task-specification.use-case';
import { TasksRepository, TaskEvaluationSource } from './tasks.repository';
import { type EvaluationJobData } from './evaluation.queue';
import { type TaskSpecification } from '../application/task-specification';

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

/** Cria um Job mínimo com o payload informado (só o necessário para o process). */
function makeJob(taskId: string): Job<EvaluationJobData> {
  return { data: { taskId } } as Job<EvaluationJobData>;
}

describe('EvaluationProcessor', () => {
  let evaluateUseCase: { execute: ReturnType<typeof vi.fn> };
  let repository: { findTaskWithArtifactById: ReturnType<typeof vi.fn> };
  let processor: EvaluationProcessor;

  beforeEach(() => {
    evaluateUseCase = { execute: vi.fn() };
    repository = { findTaskWithArtifactById: vi.fn() };
    processor = new EvaluationProcessor(
      evaluateUseCase as unknown as EvaluateTaskSpecificationUseCase,
      repository as unknown as TasksRepository,
    );
  });

  it('reidrata a spec e chama o use-case com {taskId, description, specification}', async () => {
    const source: TaskEvaluationSource = {
      description: 'necessidade original',
      specification: SPEC,
    };
    repository.findTaskWithArtifactById.mockResolvedValue(source);
    evaluateUseCase.execute.mockResolvedValue({
      status: 'completed',
      result: 'APPROVED',
      overallScore: 8.5,
    });

    await processor.process(makeJob('task-1'));

    expect(repository.findTaskWithArtifactById).toHaveBeenCalledWith('task-1');
    expect(evaluateUseCase.execute).toHaveBeenCalledOnce();
    expect(evaluateUseCase.execute).toHaveBeenCalledWith({
      taskId: 'task-1',
      description: 'necessidade original',
      specification: SPEC,
    });
  });

  it('não chama o use-case e não relança quando a task/artifact é inválida', async () => {
    repository.findTaskWithArtifactById.mockResolvedValue(null);

    await expect(processor.process(makeJob('task-1'))).resolves.toBeUndefined();

    expect(evaluateUseCase.execute).not.toHaveBeenCalled();
  });

  it('propaga erro inesperado de infra para o BullMQ acionar retry', async () => {
    repository.findTaskWithArtifactById.mockRejectedValue(new Error('banco indisponível'));

    await expect(processor.process(makeJob('task-1'))).rejects.toThrow('banco indisponível');
    expect(evaluateUseCase.execute).not.toHaveBeenCalled();
  });
});
