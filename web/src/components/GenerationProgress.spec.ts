import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/vue';
import type { TaskGenerationEvent } from '@/services/task-events';
import GenerationProgress from './GenerationProgress.vue';

function progressEvent(event: TaskGenerationEvent['event']): TaskGenerationEvent {
  return {
    event,
    runId: 'run-1',
    timestamp: '2024-02-05T14:30:00-03:00',
  } as TaskGenerationEvent;
}

describe('GenerationProgress', () => {
  it('deve renderizar todos os passos com rótulos pt-BR', () => {
    render(GenerationProgress, { props: { events: [], status: 'connecting' } });

    expect(screen.getByText('Iniciando')).toBeInTheDocument();
    expect(screen.getByText('Analisando contexto')).toBeInTheDocument();
    expect(screen.getByText('Elaborando requisitos')).toBeInTheDocument();
    expect(screen.getByText('Definindo critérios de aceite')).toBeInTheDocument();
    expect(screen.getByText('Revisando')).toBeInTheDocument();
  });

  it('deve mostrar o spinner enquanto está em streaming', () => {
    render(GenerationProgress, {
      props: { events: [progressEvent('started')], status: 'streaming' },
    });

    expect(screen.getByRole('status', { name: 'Gerando especificação' })).toBeInTheDocument();
  });

  it('deve destacar o passo atual conforme os eventos recebidos', () => {
    render(GenerationProgress, {
      props: {
        events: [progressEvent('started'), progressEvent('analyzing_context')],
        status: 'streaming',
      },
    });

    // O passo atual é o último recebido: "Analisando contexto".
    // O texto aparece no cabeçalho (aria-live) e no passo; pegamos o item da lista.
    const stepItem = screen
      .getAllByText('Analisando contexto')
      .map((el) => el.closest('li'))
      .find((li): li is HTMLLIElement => li !== null);
    expect(stepItem).toHaveAttribute('aria-current', 'step');
  });

  it('não deve mostrar spinner quando concluído', () => {
    render(GenerationProgress, {
      props: { events: [progressEvent('started')], status: 'completed' },
    });

    expect(screen.queryByRole('status', { name: 'Gerando especificação' })).not.toBeInTheDocument();
  });
});
