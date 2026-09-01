import { describe, it, expect } from 'vitest';
import { EvaluationStatus, Prisma, TaskEvaluation, TaskStatus } from '@prisma/client';
import { toTaskDetail, toTaskEvaluationView } from './tasks.presenter';
import { TaskWithRelations } from '../infrastructure/tasks.repository';

/** Cria uma TaskEvaluation completa, permitindo sobrescrever campos. */
function makeEvaluation(overrides: Partial<TaskEvaluation> = {}): TaskEvaluation {
  return {
    id: 'eval-1',
    taskId: 'task-1',
    status: EvaluationStatus.COMPLETED,
    result: 'APPROVED',
    promptVersion: 'judge-v1',
    score: new Prisma.Decimal('8.33'),
    rationale: 'Especificação clara e completa.',
    dimensions: {
      scores: {
        clarity: 9,
        completeness: 8,
        consistency: 8,
        testability: 9,
        risks: 7,
        requirementsAdherence: 9,
      },
      overallScore: 8.33,
      reasons: [],
    },
    model: 'fake-judge',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T10:20:30.000Z'),
    ...overrides,
  };
}

/** Cria uma task com relações mínimas, permitindo sobrescrever a evaluation. */
function makeTask(overrides: Partial<TaskWithRelations> = {}): TaskWithRelations {
  return {
    id: 'task-1',
    userId: 'user-1',
    description: 'uma descrição de tarefa com mais de cinquenta caracteres exigidos aqui',
    status: TaskStatus.COMPLETED,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T10:20:30.000Z'),
    artifacts: [],
    generationRuns: [],
    evaluation: null,
    ...overrides,
  };
}

describe('toTaskEvaluationView', () => {
  it('retorna null quando não há avaliação', () => {
    expect(toTaskEvaluationView(null)).toBeNull();
  });

  it('expõe uma avaliação COMPLETED com dimensions, result e score', () => {
    const view = toTaskEvaluationView(makeEvaluation());

    expect(view).not.toBeNull();
    expect(view?.status).toBe('COMPLETED');
    expect(view?.result).toBe('APPROVED');
    expect(view?.overallScore).toBe(8.33);
    expect(view?.criteria).toEqual({
      clarity: 9,
      completeness: 8,
      consistency: 8,
      testability: 9,
      risks: 7,
      requirementsAdherence: 9,
    });
    expect(view?.reasons).toEqual([]);
    expect(view?.model).toBe('fake-judge');
    expect(view?.promptVersion).toBe('judge-v1');
    expect(view?.evaluatedAt).toBe('2024-01-02T10:20:30.000Z');
  });

  it('preenche reasons quando a avaliação foi REJEITADA', () => {
    const view = toTaskEvaluationView(
      makeEvaluation({
        result: 'REJECTED',
        score: new Prisma.Decimal('4.50'),
        dimensions: {
          scores: {
            clarity: 5,
            completeness: 4,
            consistency: 4,
            testability: 5,
            risks: 4,
            requirementsAdherence: 5,
          },
          overallScore: 4.5,
          reasons: ['score geral 4.50 abaixo do minimo 7.00'],
        },
      }),
    );

    expect(view?.result).toBe('REJECTED');
    expect(view?.overallScore).toBe(4.5);
    expect(view?.reasons).toEqual(['score geral 4.50 abaixo do minimo 7.00']);
  });

  it('trata avaliação UNAVAILABLE (score/result/dimensions nulos)', () => {
    const view = toTaskEvaluationView(
      makeEvaluation({
        status: EvaluationStatus.UNAVAILABLE,
        result: null,
        score: null,
        rationale: 'juiz indisponível',
        dimensions: null,
        model: null,
        promptVersion: null,
      }),
    );

    expect(view?.status).toBe('UNAVAILABLE');
    expect(view?.result).toBeNull();
    expect(view?.overallScore).toBeNull();
    expect(view?.criteria).toBeNull();
    expect(view?.reasons).toEqual([]);
    expect(view?.model).toBeNull();
    expect(view?.promptVersion).toBeNull();
    expect(view?.evaluatedAt).toBe('2024-01-02T10:20:30.000Z');
  });

  it('não expõe evaluatedAt enquanto PENDING', () => {
    const view = toTaskEvaluationView(
      makeEvaluation({
        status: EvaluationStatus.PENDING,
        result: null,
        score: null,
        dimensions: null,
      }),
    );

    expect(view?.status).toBe('PENDING');
    expect(view?.evaluatedAt).toBeNull();
  });

  it('faz parse defensivo: dimensions com shape inesperado (string) → criteria null, reasons []', () => {
    const view = toTaskEvaluationView(
      makeEvaluation({ dimensions: 'nao-e-um-objeto' as unknown as Prisma.JsonValue }),
    );

    expect(view?.criteria).toBeNull();
    expect(view?.reasons).toEqual([]);
  });

  it('faz parse defensivo: dimensions sem scores → criteria null', () => {
    const view = toTaskEvaluationView(
      makeEvaluation({ dimensions: { overallScore: 8.33, reasons: ['ok'] } }),
    );

    expect(view?.criteria).toBeNull();
    expect(view?.reasons).toEqual(['ok']);
  });

  it('faz parse defensivo: scores com valores não-numéricos → criteria null', () => {
    const view = toTaskEvaluationView(
      makeEvaluation({ dimensions: { scores: { clarity: 'alto' }, reasons: [] } }),
    );

    expect(view?.criteria).toBeNull();
  });
});

describe('toTaskDetail', () => {
  it('inclui evaluation null quando a task ainda não foi avaliada', () => {
    const view = toTaskDetail(makeTask({ evaluation: null }));

    expect(view.evaluation).toBeNull();
  });

  it('inclui a evaluation serializada quando existe', () => {
    const view = toTaskDetail(makeTask({ evaluation: makeEvaluation() }));

    expect(view.evaluation).not.toBeNull();
    expect(view.evaluation?.status).toBe('COMPLETED');
    expect(view.evaluation?.overallScore).toBe(8.33);
  });
});
