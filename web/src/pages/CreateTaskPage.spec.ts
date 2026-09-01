import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { ref } from 'vue';
import CreateTaskPage from './CreateTaskPage.vue';

// --- Mock do router: push espionável. ---
const push = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}));

// --- Mock da store de tasks. ---
const tasks = {
  isLoading: ref(false),
  error: ref<string | null>(null),
  create: vi.fn<(description: string) => Promise<string | null>>(),
};

vi.mock('@/stores/tasks.store', () => ({
  useTasksStore: () => tasks,
}));

vi.mock('pinia', () => ({
  storeToRefs: (store: typeof tasks) => ({ isLoading: store.isLoading, error: store.error }),
}));

// Texto válido (>= 50 caracteres após trim).
const VALID_DESCRIPTION =
  'Preciso de um endpoint REST para cadastrar usuários com validação de e-mail.';

function getTextarea(): HTMLElement {
  return screen.getByLabelText('Descrição da necessidade técnica', { exact: false });
}

describe('CreateTaskPage', () => {
  beforeEach(() => {
    push.mockClear();
    tasks.isLoading.value = false;
    tasks.error.value = null;
    tasks.create.mockReset();
  });

  it('não deve submeter quando o texto tem menos de 50 caracteres', async () => {
    const user = userEvent.setup();
    render(CreateTaskPage);

    await user.type(getTextarea(), 'texto curto');
    await user.click(screen.getByRole('button', { name: 'Gerar especificação' }));

    expect(tasks.create).not.toHaveBeenCalled();
  });

  it('deve chamar create e navegar para /tasks/{id} no sucesso', async () => {
    const user = userEvent.setup();
    tasks.create.mockResolvedValue('task-123');
    render(CreateTaskPage);

    await user.type(getTextarea(), VALID_DESCRIPTION);
    await user.click(screen.getByRole('button', { name: 'Gerar especificação' }));

    expect(tasks.create).toHaveBeenCalledWith(VALID_DESCRIPTION);
    expect(push).toHaveBeenCalledWith('/tasks/task-123');
  });

  it('deve exibir o erro da store e não navegar quando create retorna null', async () => {
    const user = userEvent.setup();
    tasks.create.mockImplementation(() => {
      tasks.error.value = 'Não foi possível criar a tarefa.';
      return Promise.resolve(null);
    });
    render(CreateTaskPage);

    await user.type(getTextarea(), VALID_DESCRIPTION);
    await user.click(screen.getByRole('button', { name: 'Gerar especificação' }));

    expect(tasks.create).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível criar a tarefa.');
  });
});
