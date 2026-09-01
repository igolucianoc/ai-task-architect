import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/vue';
import TaskStatusBadge from './TaskStatusBadge.vue';

describe('TaskStatusBadge', () => {
  it.each([
    ['PENDING', 'Pendente'],
    ['STREAMING', 'Gerando'],
    ['COMPLETED', 'Concluída'],
    ['FAILED', 'Falhou'],
  ])('deve renderizar o rótulo pt-BR para o status %s', (status, label) => {
    render(TaskStatusBadge, { props: { status } });

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('deve exibir o valor cru para status desconhecido', () => {
    render(TaskStatusBadge, { props: { status: 'DESCONHECIDO' } });

    expect(screen.getByText('DESCONHECIDO')).toBeInTheDocument();
  });
});
