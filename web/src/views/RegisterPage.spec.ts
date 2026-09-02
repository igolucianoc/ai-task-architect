import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { defineComponent, h, ref } from 'vue';
import RegisterPage from './RegisterPage.vue';

// --- Mock do router: push espionável. ---
const push = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  // Stub simples do RouterLink: renderiza um <a> com o slot (link navegável).
  RouterLink: defineComponent({
    props: { to: { type: [String, Object], required: true } },
    setup:
      (props, { slots }) =>
      () =>
        h('a', { href: String(props.to) }, slots.default?.()),
  }),
}));

// --- Mock da store de auth (dependência mockada). ---
const auth = {
  isAuthenticated: false,
  error: ref<string | null>(null),
  isLoading: ref(false),
  login: vi.fn(),
  register: vi.fn(),
};

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => auth,
}));

// storeToRefs apenas devolve as refs já expostas pelo mock.
vi.mock('pinia', () => ({
  storeToRefs: (store: typeof auth) => ({ isLoading: store.isLoading, error: store.error }),
}));

function renderPage() {
  return render(RegisterPage);
}

describe('RegisterPage', () => {
  beforeEach(() => {
    push.mockClear();
    auth.isAuthenticated = false;
    auth.error.value = null;
    auth.isLoading.value = false;
    auth.register.mockReset();
  });

  it('deve renderizar os campos de nome, e-mail e senha e o botão Criar conta', () => {
    renderPage();

    expect(screen.getByLabelText('Nome', { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail', { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('Senha', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeInTheDocument();
  });

  it('deve chamar auth.register com os valores ao submeter campos preenchidos', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Nome', { exact: false }), 'Ana Silva');
    await user.type(screen.getByLabelText('E-mail', { exact: false }), 'ana@exemplo.com');
    await user.type(screen.getByLabelText('Senha', { exact: false }), 'senha123');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(auth.register).toHaveBeenCalledWith('ana@exemplo.com', 'senha123', 'Ana Silva');
  });

  it('deve exibir a mensagem de erro da store com role alert', () => {
    auth.error.value = 'E-mail já cadastrado.';
    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('E-mail já cadastrado.');
  });

  it('deve navegar para /tasks quando o registro autentica com sucesso', async () => {
    const user = userEvent.setup();
    auth.register.mockImplementation(() => {
      // Simula o efeito da action bem-sucedida.
      auth.isAuthenticated = true;
      return Promise.resolve();
    });
    renderPage();

    await user.type(screen.getByLabelText('Nome', { exact: false }), 'Ana Silva');
    await user.type(screen.getByLabelText('E-mail', { exact: false }), 'ana@exemplo.com');
    await user.type(screen.getByLabelText('Senha', { exact: false }), 'senha123');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(push).toHaveBeenCalledWith('/tasks');
  });

  it('não deve chamar auth.register ao submeter com campos vazios', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(auth.register).not.toHaveBeenCalled();
  });
});
