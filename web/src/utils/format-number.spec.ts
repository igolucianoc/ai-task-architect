import { describe, it, expect } from 'vitest';
import { formatInteger, formatCost } from './format-number';

describe('formatInteger', () => {
  it('deve formatar milhares com separador pt-BR', () => {
    expect(formatInteger(1234)).toBe('1.234');
  });

  it('deve formatar zero como "0"', () => {
    expect(formatInteger(0)).toBe('0');
  });

  it('deve arredondar valores fracionários para inteiro', () => {
    expect(formatInteger(1234.6)).toBe('1.235');
  });
});

describe('formatCost', () => {
  it('deve formatar o custo com casas decimais usando vírgula pt-BR', () => {
    expect(formatCost(0.00129)).toBe('0,00129');
  });

  it('deve formatar custo zero como "0"', () => {
    expect(formatCost(0)).toBe('0');
  });

  it('deve limitar a 6 casas decimais', () => {
    // 0,0000001 excede 6 casas e é arredondado para 0.
    expect(formatCost(0.0000001)).toBe('0');
  });
});
