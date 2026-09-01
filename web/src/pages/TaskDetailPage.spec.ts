import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { defineComponent, h, ref, readonly } from 'vue';
import type { StreamStatus } from '@/composables/useTaskGenerationStream';
import type { TaskGenerationEvent, TaskSpecification } from '@/services/task-events';
import type { TaskDetail } from '@/services/tasks.service';
import TaskDetailPage from './TaskDetailPage.vue';

// --- Mock do router: useRoute com id fixo + RouterLink stub navegável. ---
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'task-1' } }),
  RouterLink: defineComponent({
    props: { to: { type: [String, Object], required: true } },
    setup:
      (props, { slots }) =>
      () =>
        h('a', { href: String(props.to) }, slots.default?.()),
  }),
}));

// --- Mock da store de tasks ---
const tasks = {
  current: ref<TaskDetail | null>(null),
  isLoadingDetail: ref(false),
  detailError: ref<string | null>(null),
  fetchDetail: vi.fn<(id: string) => Promise<void>>(),
};

vi.mock('@/stores/tasks.store', () => ({
  useTasksStore: () => tasks,
}));

// --- Mock da store de auth ---
// A página lê `authStore.accessToken` como valor (Pinia desembrulha o ref).
// Reproduzimos isso com um getter apoiado num ref controlável no teste.
const accessTokenRef = ref<string | null>('token-abc');
const auth = {
  get accessToken(): string | null {
    return accessTokenRef.value;
  },
};

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => auth,
}));

// storeToRefs só é usado com a store de tasks nesta página.
vi.mock('pinia', () => ({
  storeToRefs: (store: typeof tasks) => ({
    current: store.current,
    isLoadingDetail: store.isLoadingDetail,
    detailError: store.detailError,
  }),
}));

// --- Mock do composable de stream com refs controláveis ---
const streamState = {
  events: ref<TaskGenerationEvent[]>([]),
  status: ref<StreamStatus>('idle'),
  specification: ref<TaskSpecification | null>(null),
  error: ref<string | null>(null),
  currentEvent: ref<TaskGenerationEvent | null>(null),
  start: vi.fn(),
  stop: vi.fn(),
};

vi.mock('@/composables/useTaskGenerationStream', () => ({
  useTaskGenerationStream: () => ({
    events: readonly(streamState.events),
    status: readonly(streamState.status),
    specification: readonly(streamState.specification),
    error: readonly(streamState.error),
    currentEvent: readonly(streamState.currentEvent),
    start: streamState.start,
    stop: streamState.stop,
  }),
}));

function makeSpec(): TaskSpecification {
  return {
    title: 'Cadastro de usuários',
    context: 'Contexto qualquer.',
    objective: 'Objetivo qualquer.',
    functionalRequirements: ['Requisito 1'],
    nonFunctionalRequirements: [],
    acceptanceCriteria: [],
    technicalTasks: [],
    risks: [],
    dependencies: [],
    definitionOfDone: [],
  };
}

function makeDetail(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    id: 'task-1',
    description: 'Preciso de um cadastro de usuários.',
    status: 'PENDING',
    createdAt: '2024-02-05T14:30:00-03:00',
    updatedAt: '2024-02-05T14:30:00-03:00',
    specification: null,
    lastRun: null,
    evaluation: null,
    ...overrides,
  };
}

describe('TaskDetailPage', () => {
  beforeEach(() => {
    tasks.current.value = makeDetail();
    tasks.isLoadingDetail.value = false;
    tasks.detailError.value = null;
    tasks.fetchDetail.mockReset();
    tasks.fetchDetail.mockResolvedValue(undefined);

    accessTokenRef.value = 'token-abc';

    streamState.events.value = [];
    streamState.status.value = 'idle';
    streamState.specification.value = null;
    streamState.error.value = null;
    streamState.currentEvent.value = null;
    streamState.start.mockReset();
    streamState.stop.mockReset();
  });

  it('deve buscar o detalhe e iniciar o stream com id e token ao montar', async () => {
    render(TaskDetailPage);
    await flushPromises();

    expect(tasks.fetchDetail).toHaveBeenCalledWith('task-1');
    expect(streamState.start).toHaveBeenCalledWith('task-1', 'token-abc');
  });

  it('deve renderizar a SpecificationView quando o stream fica completed', async () => {
    render(TaskDetailPage);
    await flushPromises();

    // Simula o stream concluindo com a especificação.
    streamState.specification.value = makeSpec();
    streamState.status.value = 'completed';
    await flushPromises();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Cadastro de usuários' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Requisito 1')).toBeInTheDocument();
  });

  it('deve refazer fetchDetail para buscar a avaliação após completed', async () => {
    render(TaskDetailPage);
    await flushPromises();

    // 1 chamada no onMounted.
    expect(tasks.fetchDetail).toHaveBeenCalledTimes(1);

    streamState.specification.value = makeSpec();
    streamState.status.value = 'completed';
    await flushPromises();

    // O watcher de completed dispara o polling, que refaz fetchDetail.
    expect(tasks.fetchDetail).toHaveBeenCalledTimes(2);
  });

  it('deve renderizar o EvaluationPanel quando a avaliação está pronta', async () => {
    // fetchDetail do polling entrega a avaliação COMPLETED.
    tasks.fetchDetail.mockImplementation(() => {
      tasks.current.value = makeDetail({
        status: 'COMPLETED',
        specification: makeSpec(),
        evaluation: {
          status: 'COMPLETED',
          result: 'APPROVED',
          overallScore: 9,
          rationale: 'Muito boa.',
          criteria: { clarity: 8 },
          reasons: [],
          model: 'gpt-4o',
          promptVersion: 'v1',
          evaluatedAt: '2024-02-05T14:31:00-03:00',
        },
      });
      return Promise.resolve();
    });

    render(TaskDetailPage);
    await flushPromises();

    streamState.specification.value = makeSpec();
    streamState.status.value = 'completed';
    await flushPromises();

    expect(screen.getByText('APROVADO')).toBeInTheDocument();
    expect(screen.getByText('9/10')).toBeInTheDocument();
  });

  it('deve mostrar mensagem de falha quando o stream falha', async () => {
    render(TaskDetailPage);
    await flushPromises();

    streamState.error.value = 'Geração falhou no worker.';
    streamState.status.value = 'failed';
    await flushPromises();

    expect(screen.getByRole('alert')).toHaveTextContent('Geração falhou no worker.');
    expect(screen.getByRole('link', { name: 'Voltar às tarefas' })).toHaveAttribute(
      'href',
      '/tasks',
    );
  });

  it('deve mostrar erro e não iniciar o stream quando não há token', async () => {
    accessTokenRef.value = null;
    render(TaskDetailPage);
    await flushPromises();

    expect(streamState.start).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/Sessão expirada/i);
  });
});
