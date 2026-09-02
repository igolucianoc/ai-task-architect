import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { registerAuthGuard } from './guards';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/views/HomePage.vue'),
  },
  {
    path: '/login',
    component: () => import('@/views/LoginPage.vue'),
    meta: { requiresGuest: true },
  },
  {
    path: '/register',
    component: () => import('@/views/RegisterPage.vue'),
    meta: { requiresGuest: true },
  },
  {
    path: '/tasks',
    component: () => import('@/views/TasksPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    // Rota estática declarada antes da dinâmica para casar '/tasks/new' com segurança.
    path: '/tasks/new',
    component: () => import('@/views/CreateTaskPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/tasks/:id',
    component: () => import('@/views/TaskDetailPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/:pathMatch(.*)*',
    component: () => import('@/views/NotFoundPage.vue'),
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Guard de autenticação: bootstrap único + requiresAuth/requiresGuest.
registerAuthGuard(router);
