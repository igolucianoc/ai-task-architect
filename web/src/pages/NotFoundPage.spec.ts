import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/vue';
import { defineComponent, h } from 'vue';
import NotFoundPage from './NotFoundPage.vue';

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

describe('NotFoundPage', () => {
  it('deve renderizar o heading e o link "Voltar ao início" apontando para "/"', () => {
    render(NotFoundPage);

    expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');
  });
});
