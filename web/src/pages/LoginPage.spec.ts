import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { defineComponent, h, ref } from 'vue';
import LoginPage from './LoginPage.vue';

// --- Mock do router: push espionável e route com query controlável. ---
const push = vi.fn();
const route = { query: {} as Record<string, string> };

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => route,
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
  return render(LoginPage);
}

describe('LoginPage', () => {
  beforeEach(() => {
    push.mockClear();
    route.query = {};
    auth.isAuthenticated = false;
    auth.error.value = null;
    auth.isLoading.value = false;
    auth.login.mockReset();
  });

  it('deve renderizar os campos de e-mail e senha e o botão Entrar', () => {
    renderPage();

    expect(screen.getByLabelText('E-mail', { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('Senha', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('deve chamar auth.login com os valores ao submeter campos preenchidos', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('E-mail', { exact: false }), 'ana@exemplo.com');
    await user.type(screen.getByLabelText('Senha', { exact: false }), 'senha123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(auth.login).toHaveBeenCalledWith('ana@exemplo.com', 'senha123');
  });

  it('deve exibir a mensagem de erro da store com role alert', () => {
    auth.error.value = 'Credenciais inválidas.';
    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('Credenciais inválidas.');
  });

  it('deve navegar para /tasks quando o login autentica com sucesso', async () => {
    const user = userEvent.setup();
    auth.login.mockImplementation(() => {
      // Simula o efeito da action bem-sucedida.
      auth.isAuthenticated = true;
      return Promise.resolve();
    });
    renderPage();

    await user.type(screen.getByLabelText('E-mail', { exact: false }), 'ana@exemplo.com');
    await user.type(screen.getByLabelText('Senha', { exact: false }), 'senha123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(push).toHaveBeenCalledWith('/tasks');
  });

  it('deve respeitar a query redirect segura ao autenticar', async () => {
    const user = userEvent.setup();
    route.query = { redirect: '/tasks/42' };
    auth.login.mockImplementation(() => {
      auth.isAuthenticated = true;
      return Promise.resolve();
    });
    renderPage();

    await user.type(screen.getByLabelText('E-mail', { exact: false }), 'ana@exemplo.com');
    await user.type(screen.getByLabelText('Senha', { exact: false }), 'senha123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(push).toHaveBeenCalledWith('/tasks/42');
  });

  it('não deve chamar auth.login ao submeter com campos vazios', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(auth.login).not.toHaveBeenCalled();
  });
});
