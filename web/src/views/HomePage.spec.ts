import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/vue';
import { defineComponent, h } from 'vue';
import HomePage from './HomePage.vue';

// --- Mock do router: RouterLink como <a> navegável para consultar o href. ---
vi.mock('vue-router', () => ({
  RouterLink: defineComponent({
    props: { to: { type: [String, Object], required: true } },
    setup:
      (props, { slots }) =>
      () =>
        h('a', { href: String(props.to) }, slots.default?.()),
  }),
}));

// --- Mock da store de auth com isAuthenticated controlável. ---
const auth = { isAuthenticated: false };

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => auth,
}));

describe('HomePage', () => {
  beforeEach(() => {
    auth.isAuthenticated = false;
  });

  it('deve exibir os CTAs "Começar" e "Entrar" quando não autenticado', () => {
    render(HomePage);

    expect(screen.getByRole('link', { name: 'Começar' })).toHaveAttribute('href', '/register');
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login');
    expect(screen.queryByText('Ir para minhas tarefas')).not.toBeInTheDocument();
  });

  it('deve exibir o CTA "Ir para minhas tarefas" quando autenticado', () => {
    auth.isAuthenticated = true;
    render(HomePage);

    expect(screen.getByRole('link', { name: 'Ir para minhas tarefas' })).toHaveAttribute(
      'href',
      '/tasks',
    );
    expect(screen.getByRole('link', { name: 'Nova tarefa' })).toHaveAttribute('href', '/tasks/new');
    expect(screen.queryByText('Começar')).not.toBeInTheDocument();
  });
});
