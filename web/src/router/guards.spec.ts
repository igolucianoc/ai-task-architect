import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router';
import { defineComponent } from 'vue';
import * as authService from '@/services/auth.service';
import { registerAuthGuard } from './guards';

// Mocka o service para controlar o bootstrap (refresh) no guard.
vi.mock('@/services/auth.service');

/** Componente vazio para as rotas de teste. */
const Blank = defineComponent({ template: '<div />' });

const routes: RouteRecordRaw[] = [
  { path: '/login', component: Blank, meta: { requiresGuest: true } },
  { path: '/tasks', component: Blank, meta: { requiresAuth: true } },
  { path: '/', component: Blank },
];

/** Cria um router isolado com o guard registrado. */
function makeRouter() {
  const router = createRouter({ history: createMemoryHistory(), routes });
  registerAuthGuard(router);
  return router;
}

describe('registerAuthGuard', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('rota protegida sem autenticação redireciona para /login com redirect', async () => {
    // bootstrap falha => segue deslogado.
    vi.mocked(authService.refresh).mockRejectedValue(new Error('sem sessão'));
    const router = makeRouter();

    await router.push('/tasks');
    await router.isReady();

    expect(router.currentRoute.value.path).toBe('/login');
    expect(router.currentRoute.value.query.redirect).toBe('/tasks');
  });

  it('rota de guest com sessão restaurada redireciona para /tasks', async () => {
    vi.mocked(authService.refresh).mockResolvedValue({
      user: { id: 'u1', email: 'a@b.com', displayName: 'Alice' },
      accessToken: 'tok',
    });
    const router = makeRouter();

    await router.push('/login');
    await router.isReady();

    expect(router.currentRoute.value.path).toBe('/tasks');
  });
});
