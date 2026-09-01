import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import BaseButton from './BaseButton.vue';

describe('BaseButton', () => {
  it('deve renderizar o rótulo passado pelo slot', () => {
    render(BaseButton, { slots: { default: 'Entrar' } });

    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('deve emitir click ao ser clicado', async () => {
    const user = userEvent.setup();
    const { emitted } = render(BaseButton, { slots: { default: 'Entrar' } });

    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(emitted()).toHaveProperty('click');
    expect(emitted().click).toHaveLength(1);
  });

  it('não deve emitir click quando disabled', async () => {
    const user = userEvent.setup();
    const { emitted } = render(BaseButton, {
      props: { disabled: true },
      slots: { default: 'Entrar' },
    });

    const button = screen.getByRole('button', { name: 'Entrar' });
    expect(button).toBeDisabled();

    await user.click(button);

    expect(emitted().click).toBeUndefined();
  });

  it('não deve emitir click e deve ficar aria-busy quando loading', async () => {
    const user = userEvent.setup();
    const { emitted } = render(BaseButton, {
      props: { loading: true },
      slots: { default: 'Entrar' },
    });

    const button = screen.getByRole('button', { name: /Entrar/ });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();

    await user.click(button);

    expect(emitted().click).toBeUndefined();
  });
});
