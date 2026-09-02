import { describe, it, expect } from 'vitest';
import {
  ADHERENCE_FLOOR,
  APPROVAL_THRESHOLD,
  computeOverallScore,
  evaluateQualityGate,
  parseJudgeResponse,
  type EvaluationScores,
} from '../domain/task-evaluation';

const highScores: EvaluationScores = {
  clarity: 9,
  completeness: 8,
  consistency: 9,
  testability: 8,
  risks: 9,
  requirementsAdherence: 9,
};

const validJudge = {
  scores: highScores,
  rationale: 'Especificação clara, completa e aderente aos requisitos.',
};

describe('parseJudgeResponse', () => {
  it('faz parse de um JSON válido e puro', () => {
    const result = parseJudgeResponse(JSON.stringify(validJudge));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scores.clarity).toBe(9);
      expect(result.data.rationale).toBe(validJudge.rationale);
    }
  });

  it('extrai JSON embrulhado em cerca markdown (```json ... ```)', () => {
    const wrapped = 'Avaliação:\n```json\n' + JSON.stringify(validJudge) + '\n```\nFim.';
    const result = parseJudgeResponse(wrapped);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scores.requirementsAdherence).toBe(9);
    }
  });

  it('extrai JSON quando há texto antes e depois', () => {
    const noisy = 'Segue o veredito: ' + JSON.stringify(validJudge) + ' Obrigado.';
    const result = parseJudgeResponse(noisy);

    expect(result.success).toBe(true);
  });

  it('falha quando não há JSON na resposta', () => {
    const result = parseJudgeResponse('Não consegui avaliar a especificação.');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('nenhum objeto JSON');
    }
  });

  it('falha quando o JSON é sintaticamente inválido', () => {
    const result = parseJudgeResponse('{ "scores": { "clarity": }, "rationale": "x" }');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/JSON válido|objeto JSON/);
    }
  });

  it('rejeita score acima da faixa (11)', () => {
    const invalid = { ...validJudge, scores: { ...highScores, clarity: 11 } };
    const result = parseJudgeResponse(JSON.stringify(invalid));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('clarity');
    }
  });

  it('rejeita score abaixo da faixa (-1)', () => {
    const invalid = { ...validJudge, scores: { ...highScores, risks: -1 } };
    const result = parseJudgeResponse(JSON.stringify(invalid));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('risks');
    }
  });

  it('rejeita score não-inteiro', () => {
    const invalid = { ...validJudge, scores: { ...highScores, testability: 7.5 } };
    const result = parseJudgeResponse(JSON.stringify(invalid));

    expect(result.success).toBe(false);
  });

  it('falha quando falta um critério', () => {
    const partial = {
      clarity: 9,
      completeness: 8,
      consistency: 9,
      testability: 8,
      risks: 9,
    };
    const invalid = { ...validJudge, scores: partial };
    const result = parseJudgeResponse(JSON.stringify(invalid));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('requirementsAdherence');
    }
  });

  it('rejeita justificativa vazia', () => {
    const invalid = { ...validJudge, rationale: '   ' };
    const result = parseJudgeResponse(JSON.stringify(invalid));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('rationale');
    }
  });
});

describe('computeOverallScore', () => {
  it('calcula a média correta dos seis critérios', () => {
    const scores: EvaluationScores = {
      clarity: 10,
      completeness: 10,
      consistency: 10,
      testability: 10,
      risks: 10,
      requirementsAdherence: 10,
    };

    expect(computeOverallScore(scores)).toBe(10);
  });

  it('arredonda a 2 casas decimais (ex.: 8.33)', () => {
    const scores: EvaluationScores = {
      clarity: 8,
      completeness: 8,
      consistency: 8,
      testability: 9,
      risks: 8,
      requirementsAdherence: 9,
    };

    // (8+8+8+9+8+9)/6 = 50/6 = 8.3333... => 8.33
    expect(computeOverallScore(scores)).toBe(8.33);
  });
});

describe('evaluateQualityGate', () => {
  it('APROVA quando todos os critérios são altos', () => {
    const gate = evaluateQualityGate(highScores);

    expect(gate.result).toBe('APPROVED');
    expect(gate.reasons).toEqual([]);
    expect(gate.overallScore).toBeGreaterThanOrEqual(APPROVAL_THRESHOLD);
  });

  it('REJEITA quando a média fica abaixo de 7', () => {
    const scores: EvaluationScores = {
      clarity: 6,
      completeness: 6,
      consistency: 6,
      testability: 6,
      risks: 6,
      requirementsAdherence: 6,
    };

    const gate = evaluateQualityGate(scores);

    expect(gate.result).toBe('REJECTED');
    expect(gate.overallScore).toBe(6);
    expect(gate.reasons.some((r) => r.includes('score geral'))).toBe(true);
  });

  it('REJEITA por aderência abaixo do piso mesmo com média >= 7', () => {
    // Média alta o suficiente (>=7), mas adherence=4 prova que o piso manda.
    const scores: EvaluationScores = {
      clarity: 10,
      completeness: 10,
      consistency: 10,
      testability: 10,
      risks: 10,
      requirementsAdherence: 4,
    };

    const gate = evaluateQualityGate(scores);

    // (10*5 + 4)/6 = 54/6 = 9 => média >= 7, ainda assim reprova pelo piso.
    expect(gate.overallScore).toBeGreaterThanOrEqual(APPROVAL_THRESHOLD);
    expect(gate.result).toBe('REJECTED');
    expect(gate.reasons.some((r) => r.includes('aderência aos requisitos'))).toBe(true);
    expect(scores.requirementsAdherence).toBeLessThan(ADHERENCE_FLOOR);
  });

  it('REJEITA quando algum critério é 0', () => {
    const scores: EvaluationScores = {
      clarity: 10,
      completeness: 10,
      consistency: 10,
      testability: 10,
      risks: 0,
      requirementsAdherence: 10,
    };

    const gate = evaluateQualityGate(scores);

    expect(gate.result).toBe('REJECTED');
    expect(gate.reasons.some((r) => r.includes('zerado'))).toBe(true);
  });

  it('preenche reasons no REJECTED e mantém vazio no APPROVED', () => {
    const rejected = evaluateQualityGate({
      clarity: 5,
      completeness: 5,
      consistency: 5,
      testability: 5,
      risks: 5,
      requirementsAdherence: 5,
    });
    expect(rejected.result).toBe('REJECTED');
    expect(rejected.reasons.length).toBeGreaterThan(0);

    const approved = evaluateQualityGate(highScores);
    expect(approved.result).toBe('APPROVED');
    expect(approved.reasons).toHaveLength(0);
  });
});
