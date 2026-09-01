import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { defineComponent, h, ref } from 'vue';
import type { TaskSummary } from '@/services/tasks.service';
import TasksPage from './TasksPage.vue';

// --- Mock do router: RouterLink stub navegável (sem push nesta página). ---
vi.mock('vue-router', () => ({
  RouterLink: defineComponent({
    props: { to: { type: [String, Object], required: true } },
    setup:
      (props, { slots }) =>
      () =>
        h('a', { href: String(props.to) }, slots.default?.()),
  }),
}));

// --- Mock da store de tasks (dependência mockada, estado reativo). ---
const tasks = {
  items: ref<TaskSummary[]>([]),
  page: ref(1),
  totalPages: ref(1),
  isLoading: ref(false),
  error: ref<string | null>(null),
  fetchList: vi.fn(),
};

vi.mock('@/stores/tasks.store', () => ({
  useTasksStore: () => tasks,
}));

// storeToRefs devolve as refs já expostas pelo mock.
vi.mock('pinia', () => ({
  storeToRefs: (store: typeof tasks) => ({
    items: store.items,
    page: store.page,
    totalPages: store.totalPages,
    isLoading: store.isLoading,
    error: store.error,
  }),
}));

function makeTask(overrides: Partial<TaskSummary> = {}): TaskSummary {
  return {
    id: 't1',
    description: 'Implementar login com JWT',
    status: 'COMPLETED',
    createdAt: '2024-02-05T14:30:00-03:00',
    updatedAt: '2024-02-05T14:30:00-03:00',
    ...overrides,
  };
}

describe('TasksPage', () => {
  beforeEach(() => {
    tasks.items.value = [];
    tasks.page.value = 1;
    tasks.totalPages.value = 1;
    tasks.isLoading.value = false;
    tasks.error.value = null;
    tasks.fetchList.mockReset();
  });

  it('deve chamar fetchList ao montar', () => {
    render(TasksPage);

    expect(tasks.fetchList).toHaveBeenCalledTimes(1);
  });

  it('deve mostrar o estado de carregamento', () => {
    tasks.isLoading.value = true;
    render(TasksPage);

    expect(screen.getByRole('status', { name: 'Carregando tarefas' })).toBeInTheDocument();
  });

  it('deve mostrar erro com botão tentar novamente que refaz fetchList', async () => {
    const user = userEvent.setup();
    tasks.error.value = 'Falha ao carregar.';
    render(TasksPage);

    expect(screen.getByRole('alert')).toHaveTextContent('Falha ao carregar.');

    // Limpa a chamada do onMounted para isolar o efeito do clique.
    tasks.fetchList.mockClear();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(tasks.fetchList).toHaveBeenCalledTimes(1);
  });

  it('deve mostrar o estado vazio com CTA para criar a primeira tarefa', () => {
    render(TasksPage);

    expect(screen.getByText(/ainda não tem tarefas/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Criar primeira tarefa' })).toHaveAttribute(
      'href',
      '/tasks/new',
    );
  });

  it('deve renderizar a lista com descrições e status quando há items', () => {
    tasks.items.value = [
      makeTask({ id: 'a', description: 'Tarefa A', status: 'COMPLETED' }),
      makeTask({ id: 'b', description: 'Tarefa B', status: 'PENDING' }),
    ];
    render(TasksPage);

    expect(screen.getByText('Tarefa A')).toBeInTheDocument();
    expect(screen.getByText('Tarefa B')).toBeInTheDocument();
    expect(screen.getByText('Concluída')).toBeInTheDocument();
    expect(screen.getByText('Pendente')).toBeInTheDocument();
  });

  it('deve chamar fetchList(page+1) ao clicar em Próxima', async () => {
    const user = userEvent.setup();
    tasks.items.value = [makeTask()];
    tasks.page.value = 1;
    tasks.totalPages.value = 3;
    render(TasksPage);

    tasks.fetchList.mockClear();
    await user.click(screen.getByRole('button', { name: 'Próxima' }));

    expect(tasks.fetchList).toHaveBeenCalledWith(2);
  });

  it('deve desabilitar Anterior na primeira página e Próxima na última', () => {
    tasks.items.value = [makeTask()];
    tasks.page.value = 1;
    tasks.totalPages.value = 2;
    render(TasksPage);

    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeEnabled();
  });
});
