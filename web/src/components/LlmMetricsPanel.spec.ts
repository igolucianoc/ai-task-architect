import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/vue';
import type { LlmUsageView, EvaluationUsageView, LlmTotalsView } from '@/services/tasks.service';
import LlmMetricsPanel from './LlmMetricsPanel.vue';

function makeGenerationUsage(overrides: Partial<LlmUsageView> = {}): LlmUsageView {
  return {
    model: 'gpt-4o',
    promptTokens: 1200,
    completionTokens: 800,
    totalTokens: 2000,
    latencyMs: 1234,
    estimatedCost: 0.00129,
    ...overrides,
  };
}

function makeEvaluationUsage(overrides: Partial<EvaluationUsageView> = {}): EvaluationUsageView {
  return {
    promptTokens: 300,
    completionTokens: 100,
    totalTokens: 400,
    latencyMs: 567,
    estimatedCost: 0.0004,
    ...overrides,
  };
}

const EMPTY_TOTALS: LlmTotalsView = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  estimatedCost: 0,
};

describe('LlmMetricsPanel', () => {
  it('deve renderizar as métricas de geração com o modelo e tokens formatados', () => {
    render(LlmMetricsPanel, {
      props: {
        generationUsage: makeGenerationUsage(),
        evaluationUsage: null,
        totals: {
          promptTokens: 1200,
          completionTokens: 800,
          totalTokens: 2000,
          estimatedCost: 0.00129,
        },
        evaluationModel: null,
        evaluationPromptVersion: null,
      },
    });

    expect(screen.getByText('Geração')).toBeInTheDocument();
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    // Latência formatada em ms.
    expect(screen.getByText('1.234 ms')).toBeInTheDocument();
    // O custo estimado aparece no bloco de geração e também no total (mesmo
    // valor neste cenário): garantimos que foi renderizado nos dois lugares.
    expect(screen.getAllByText('0,00129')).toHaveLength(2);
  });

  it('deve renderizar as métricas de avaliação com modelo e versão do prompt', () => {
    render(LlmMetricsPanel, {
      props: {
        generationUsage: null,
        evaluationUsage: makeEvaluationUsage(),
        totals: {
          promptTokens: 300,
          completionTokens: 100,
          totalTokens: 400,
          estimatedCost: 0.0004,
        },
        evaluationModel: 'gpt-4o-mini',
        evaluationPromptVersion: 'v2',
      },
    });

    expect(screen.getByText('Avaliação')).toBeInTheDocument();
    expect(screen.getByText('gpt-4o-mini')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('567 ms')).toBeInTheDocument();
  });

  it('deve mostrar o total agregado de tokens formatado com separador de milhar', () => {
    render(LlmMetricsPanel, {
      props: {
        generationUsage: makeGenerationUsage(),
        evaluationUsage: makeEvaluationUsage(),
        totals: {
          promptTokens: 1500,
          completionTokens: 900,
          totalTokens: 2400,
          estimatedCost: 0.00169,
        },
        evaluationModel: 'gpt-4o',
        evaluationPromptVersion: 'v1',
      },
    });

    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('2.400')).toBeInTheDocument();
  });

  it('deve exibir estado vazio quando não há uso e o total é zero', () => {
    render(LlmMetricsPanel, {
      props: {
        generationUsage: null,
        evaluationUsage: null,
        totals: EMPTY_TOTALS,
        evaluationModel: null,
        evaluationPromptVersion: null,
      },
    });

    expect(screen.getByText('Sem métricas de uso disponíveis.')).toBeInTheDocument();
    expect(screen.queryByText('Geração')).not.toBeInTheDocument();
    expect(screen.queryByText('Avaliação')).not.toBeInTheDocument();
  });
});
