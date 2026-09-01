import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { registerAuthGuard } from './guards';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/pages/HomePage.vue'),
  },
  {
    path: '/login',
    component: () => import('@/pages/LoginPage.vue'),
    meta: { requiresGuest: true },
  },
  {
    path: '/register',
    component: () => import('@/pages/RegisterPage.vue'),
    meta: { requiresGuest: true },
  },
  {
    path: '/tasks',
    component: () => import('@/pages/TasksPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    // Rota estática declarada antes da dinâmica para casar '/tasks/new' com segurança.
    path: '/tasks/new',
    component: () => import('@/pages/CreateTaskPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/tasks/:id',
    component: () => import('@/pages/TaskDetailPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/:pathMatch(.*)*',
    component: () => import('@/pages/NotFoundPage.vue'),
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Guard de autenticação: bootstrap único + requiresAuth/requiresGuest.
registerAuthGuard(router);
