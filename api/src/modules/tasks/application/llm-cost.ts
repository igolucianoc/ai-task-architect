/**
 * Cálculo do custo estimado de uso de LLM (Etapa 09 — observabilidade).
 *
 * O custo é derivado do consumo de tokens e de rates configuráveis por 1000
 * tokens (ver app.config: LLM_COST_PER_1K_PROMPT_TOKENS e
 * LLM_COST_PER_1K_COMPLETION_TOKENS). A função é PURA — não acessa ambiente,
 * relógio ou I/O — o que a torna trivialmente testável.
 *
 * Comportamento neutro: quando as rates são 0 (default), o custo estimado é 0.
 * Assim, o recurso é opt-in e não altera o comportamento existente enquanto
 * não houver preços configurados.
 */

/** Rates de custo por 1000 tokens, tipicamente vindas da configuração. */
export interface LlmCostRates {
  pricePer1kPromptTokens: number;
  pricePer1kCompletionTokens: number;
}

/** Consumo de tokens necessário para o cálculo (subconjunto de LlmUsageMetrics). */
export interface LlmTokenUsage {
  promptTokens: number;
  completionTokens: number;
}

/** Casas decimais de arredondamento — alinha com Decimal(12,6) no schema. */
const COST_DECIMAL_PLACES = 6;

/**
 * Estima o custo monetário de uma chamada de LLM a partir do consumo de tokens.
 *
 * Fórmula:
 *   estimatedCost = (promptTokens/1000)*ratePrompt
 *                 + (completionTokens/1000)*rateCompletion
 *
 * O resultado é arredondado a 6 casas decimais (precisão do campo persistido).
 * Rates 0 (default) resultam em custo 0 — comportamento neutro.
 */
export function estimateLlmCost(usage: LlmTokenUsage, rates: LlmCostRates): number {
  const promptCost = (usage.promptTokens / 1000) * rates.pricePer1kPromptTokens;
  const completionCost = (usage.completionTokens / 1000) * rates.pricePer1kCompletionTokens;
  const total = promptCost + completionCost;

  // Arredonda para 6 casas decimais evitando resíduos de ponto flutuante.
  const factor = 10 ** COST_DECIMAL_PLACES;
  return Math.round(total * factor) / factor;
}
