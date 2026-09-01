import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { ref } from 'vue';
import BaseInput from './BaseInput.vue';

describe('BaseInput', () => {
  it('deve atualizar o modelo ao digitar (defineModel)', async () => {
    const user = userEvent.setup();
    const model = ref('');

    render(BaseInput, {
      props: {
        label: 'E-mail',
        'onUpdate:modelValue': (value: string) => {
          model.value = value;
        },
      },
    });

    const input = screen.getByLabelText('E-mail');
    await user.type(input, 'ana@exemplo.com');

    expect(model.value).toBe('ana@exemplo.com');
  });

  it('deve exibir a mensagem de erro com role alert e marcar aria-invalid', () => {
    render(BaseInput, {
      props: {
        label: 'E-mail',
        error: 'E-mail inválido',
      },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('E-mail inválido');
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true');
  });

  it('não deve marcar aria-invalid quando não há erro', () => {
    render(BaseInput, { props: { label: 'E-mail' } });

    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
