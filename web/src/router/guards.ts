// Guard global de navegação. Diferente da store, o guard PODE usar o router.
// Responsabilidades:
//   - Garantir que o bootstrap de sessão rodou uma única vez antes de decidir
//     (evita jogar F5 em rota protegida para /login indevidamente).
//   - Proteger rotas `meta.requiresAuth` (exige autenticação).
//   - Bloquear rotas `meta.requiresGuest` para usuários já autenticados.

import type { Router } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';

/** Registra o `beforeEach` de autenticação no router informado. */
export function registerAuthGuard(router: Router): void {
  router.beforeEach(async (to) => {
    // useAuthStore() só é chamado aqui dentro, já com o Pinia ativo.
    const auth = useAuthStore();

    // Restaura sessão a partir do cookie de refresh na primeira navegação.
    // `bootstrap` é idempotente, então chamá-lo aqui é seguro.
    if (!auth.initialized) {
      await auth.bootstrap();
    }

    const requiresAuth = to.matched.some((record) => record.meta.requiresAuth === true);
    const requiresGuest = to.matched.some((record) => record.meta.requiresGuest === true);

    if (requiresAuth && !auth.isAuthenticated) {
      // Guarda o destino para redirecionar de volta após o login.
      return { path: '/login', query: { redirect: to.fullPath } };
    }

    if (requiresGuest && auth.isAuthenticated) {
      return { path: '/tasks' };
    }

    return true;
  });
}
