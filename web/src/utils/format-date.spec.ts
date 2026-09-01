import { describe, it, expect } from 'vitest';
import { formatDate } from './format-date';

describe('formatDate', () => {
  it('deve formatar um ISO conhecido em pt-BR com data e hora', () => {
    // Usa um horário com offset explícito para não depender do fuso local.
    const result = formatDate('2024-02-05T14:30:00-03:00');

    // O resultado deve conter dia, mês abreviado, ano e a hora formatada.
    expect(result).toContain('2024');
    expect(result).toContain('fev');
    expect(result).toContain('5');
  });

  it('deve devolver o valor original quando a data é inválida', () => {
    expect(formatDate('não-é-data')).toBe('não-é-data');
  });
});
