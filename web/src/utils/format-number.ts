// Formatação numérica em pt-BR usando Intl (sem libs externas).

/**
 * Formata um inteiro com separador de milhar pt-BR (ex.: 1234 -> "1.234").
 * Arredonda para inteiro por segurança, já que contadores de tokens/latência
 * são valores inteiros por natureza.
 */
export function formatInteger(n: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Math.round(n));
}

/**
 * Formata o custo estimado como número puro em pt-BR, com até 6 casas decimais
 * (ex.: 0.00129 -> "0,00129"; 0 -> "0").
 *
 * Decisão: o custo é uma ESTIMATIVA configurável no backend (default 0) e a
 * moeda não é garantida pelo contrato de dados. Por isso NÃO fixamos símbolo
 * de moeda — mostramos apenas o número e deixamos o rótulo "custo estimado"
 * na UI dar o contexto. Assim evitamos afirmar uma moeda que pode não ser real.
 */
export function formatCost(n: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 }).format(n);
}
