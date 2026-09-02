import { describe, it, expect } from 'vitest';
import { estimateLlmCost, type LlmCostRates } from './llm-cost';

describe('estimateLlmCost', () => {
  it('retorna 0 quando as rates são zero (default neutro)', () => {
    const rates: LlmCostRates = {
      pricePer1kPromptTokens: 0,
      pricePer1kCompletionTokens: 0,
    };

    const cost = estimateLlmCost({ promptTokens: 1000, completionTokens: 2000 }, rates);

    expect(cost).toBe(0);
  });

  it('calcula o custo corretamente com rates positivas', () => {
    const rates: LlmCostRates = {
      pricePer1kPromptTokens: 0.5,
      pricePer1kCompletionTokens: 1.5,
    };

    // (1000/1000)*0.5 + (2000/1000)*1.5 = 0.5 + 3.0 = 3.5
    const cost = estimateLlmCost({ promptTokens: 1000, completionTokens: 2000 }, rates);

    expect(cost).toBe(3.5);
  });

  it('considera apenas a rate de prompt quando só ela é positiva', () => {
    const rates: LlmCostRates = {
      pricePer1kPromptTokens: 2,
      pricePer1kCompletionTokens: 0,
    };

    // (500/1000)*2 = 1.0
    const cost = estimateLlmCost({ promptTokens: 500, completionTokens: 9999 }, rates);

    expect(cost).toBe(1);
  });

  it('arredonda o resultado a 6 casas decimais', () => {
    const rates: LlmCostRates = {
      pricePer1kPromptTokens: 0.000_002,
      pricePer1kCompletionTokens: 0,
    };

    // (1/1000)*0.000002 = 0.000000002 → arredonda para 0.000000 (6 casas)
    const cost = estimateLlmCost({ promptTokens: 1, completionTokens: 0 }, rates);

    expect(cost).toBe(0);
  });

  it('preserva precisão de 6 casas em custos pequenos por token', () => {
    const rates: LlmCostRates = {
      pricePer1kPromptTokens: 0.03,
      pricePer1kCompletionTokens: 0.06,
    };

    // (320/1000)*0.03 + (540/1000)*0.06 = 0.0096 + 0.0324 = 0.042
    const cost = estimateLlmCost({ promptTokens: 320, completionTokens: 540 }, rates);

    expect(cost).toBeCloseTo(0.042, 6);
  });

  it('retorna 0 quando não há tokens consumidos', () => {
    const rates: LlmCostRates = {
      pricePer1kPromptTokens: 10,
      pricePer1kCompletionTokens: 10,
    };

    const cost = estimateLlmCost({ promptTokens: 0, completionTokens: 0 }, rates);

    expect(cost).toBe(0);
  });
});
