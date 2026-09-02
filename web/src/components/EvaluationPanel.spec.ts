import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/vue';
import type { TaskEvaluationView } from '@/services/tasks.service';
import EvaluationPanel from './EvaluationPanel.vue';

function makeEvaluation(overrides: Partial<TaskEvaluationView> = {}): TaskEvaluationView {
  return {
    status: 'COMPLETED',
    result: 'APPROVED',
    overallScore: 8,
    rationale: 'Especificação clara e completa.',
    criteria: { clarity: 9, completeness: 6, testability: 7 },
    reasons: [],
    model: 'gpt-4o',
    promptVersion: 'v1',
    evaluatedAt: '2024-02-05T14:30:00-03:00',
    usage: null,
    ...overrides,
  };
}

describe('EvaluationPanel', () => {
  it('COMPLETED APPROVED: mostra selo aprovado, score, critérios e justificativa', () => {
    render(EvaluationPanel, { props: { evaluation: makeEvaluation() } });

    expect(screen.getByText('APROVADO')).toBeInTheDocument();
    expect(screen.getByText('8/10')).toBeInTheDocument();
    // Critérios com rótulos pt-BR.
    expect(screen.getByText('Clareza')).toBeInTheDocument();
    expect(screen.getByText('Completude')).toBeInTheDocument();
    expect(screen.getByText('Testabilidade')).toBeInTheDocument();
    expect(screen.getByText('Especificação clara e completa.')).toBeInTheDocument();
  });

  it('COMPLETED REJECTED: mostra reprovado e a lista de motivos', () => {
    render(EvaluationPanel, {
      props: {
        evaluation: makeEvaluation({
          result: 'REJECTED',
          reasons: ['Falta critério de aceite mensurável', 'Riscos não mapeados'],
        }),
      },
    });

    expect(screen.getByText('REPROVADO')).toBeInTheDocument();
    expect(screen.getByText('Falta critério de aceite mensurável')).toBeInTheDocument();
    expect(screen.getByText('Riscos não mapeados')).toBeInTheDocument();
  });

  it('UNAVAILABLE: mostra mensagem indisponível sem selo', () => {
    render(EvaluationPanel, {
      props: {
        evaluation: makeEvaluation({
          status: 'UNAVAILABLE',
          result: null,
          overallScore: null,
          criteria: null,
          rationale: 'O serviço de avaliação estava fora do ar.',
        }),
      },
    });

    expect(screen.getByText('Avaliação indisponível')).toBeInTheDocument();
    expect(screen.getByText('O serviço de avaliação estava fora do ar.')).toBeInTheDocument();
    expect(screen.queryByText('APROVADO')).not.toBeInTheDocument();
    expect(screen.queryByText('REPROVADO')).not.toBeInTheDocument();
  });
});
