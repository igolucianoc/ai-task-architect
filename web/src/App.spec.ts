import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { ref } from 'vue';
import type { AuthUser } from './services/auth.service';
import App from './App.vue';

// --- Mock da auth store (App.vue consome estado real via store). ---
const auth = {
  isAuthenticated: ref(false),
  user: ref<AuthUser | null>(null),
  logout: vi.fn().mockResolvedValue(undefined),
};

vi.mock('./stores/auth.store', () => ({
  useAuthStore: () => auth,
}));

// storeToRefs devolve as refs já expostas pelo mock.
vi.mock('pinia', () => ({
  storeToRefs: (store: typeof auth) => ({
    isAuthenticated: store.isAuthenticated,
    user: store.user,
  }),
}));

async function renderApp() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Página inicial</div>' } },
      { path: '/login', component: { template: '<div>Login</div>' } },
      { path: '/tasks', component: { template: '<div>Tarefas</div>' } },
      { path: '/tasks/new', component: { template: '<div>Nova tarefa</div>' } },
    ],
  });

  router.push('/');
  await router.isReady();

  return render(App, {
    global: {
      plugins: [router],
    },
  });
}

describe('App', () => {
  beforeEach(() => {
    auth.isAuthenticated.value = false;
    auth.user.value = null;
    auth.logout.mockClear();
  });

  it('deve renderizar o nav e o conteúdo da rota', async () => {
    await renderApp();

    // Nav presente (marca do produto).
    expect(screen.getByRole('link', { name: 'AI Task Architect' })).toBeInTheDocument();
    // Conteúdo da rota renderizado pelo RouterView.
    expect(screen.getByText('Página inicial')).toBeInTheDocument();
  });

  it('não deve exibir o botão Sair quando não autenticado', async () => {
    await renderApp();

    expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeInTheDocument();
  });

  it('deve exibir o nome do usuário e o botão Sair quando autenticado', async () => {
    auth.isAuthenticated.value = true;
    auth.user.value = { id: '1', email: 'ana@exemplo.com', displayName: 'Ana' };
    await renderApp();

    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });
});
