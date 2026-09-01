import { z } from 'zod';
import { extractJsonObject } from './task-specification';

/**
 * Critérios objetivos avaliados pelo juiz (LLM-as-Judge).
 *
 * As chaves são em inglês (contrato com o prompt do juiz); os rótulos pt-BR
 * abaixo servem apenas de documentação:
 * - `clarity`               → Clareza
 * - `completeness`          → Completude
 * - `consistency`           → Consistência
 * - `testability`           → Testabilidade
 * - `risks`                 → Tratamento de riscos
 * - `requirementsAdherence` → Aderência aos requisitos (critério crítico)
 */
export const EVALUATION_CRITERIA = [
  'clarity',
  'completeness',
  'consistency',
  'testability',
  'risks',
  'requirementsAdherence',
] as const;

export type EvaluationCriterion = (typeof EVALUATION_CRITERIA)[number];

/**
 * Escala de pontuação: cada critério recebe uma nota INTEIRA de 0 a 10.
 * 0 = ausente/inaceitável, 10 = excelente. Notas fora da faixa ou não-inteiras
 * são rejeitadas no parsing.
 */
export const MIN_SCORE = 0;
export const MAX_SCORE = 10;

/** Notas por critério, todas na faixa 0–10 (inteiras). */
export type EvaluationScores = Record<EvaluationCriterion, number>;

/**
 * Limiar de aprovação do score geral (média dos seis critérios).
 * Abaixo disso, a avaliação é REJEITADA.
 */
export const APPROVAL_THRESHOLD = 7.0;

/**
 * Piso do critério crítico de aderência aos requisitos. Mesmo com média alta,
 * `requirementsAdherence` abaixo deste valor reprova a avaliação.
 */
export const ADHERENCE_FLOOR = 5;

/** Comprimento máximo da justificativa retornada pelo juiz. */
const RATIONALE_MAX_LENGTH = 1000;

const scoreSchema = z.number().int().min(MIN_SCORE).max(MAX_SCORE);

/**
 * Schema da resposta crua do juiz. A saída do LLM NÃO é confiável: este schema
 * é a fronteira que valida notas (inteiras, 0–10) e a justificativa antes de
 * qualquer cálculo ou persistência.
 */
export const judgeResponseSchema = z
  .object({
    scores: z
      .object({
        clarity: scoreSchema,
        completeness: scoreSchema,
        consistency: scoreSchema,
        testability: scoreSchema,
        risks: scoreSchema,
        requirementsAdherence: scoreSchema,
      })
      .strip(),
    rationale: z.string().trim().min(1, 'justificativa é obrigatória').max(RATIONALE_MAX_LENGTH),
  })
  .strip();

export type JudgeResponse = z.infer<typeof judgeResponseSchema>;

export type JudgeParseResult =
  { success: true; data: JudgeResponse } | { success: false; error: string };

/** Resultado do quality gate (espelha o enum `QualityGateResult` do Prisma). */
export type QualityGateResult = 'APPROVED' | 'REJECTED';

/** Desfecho agregado da avaliação, pronto para o caso de uso persistir. */
export interface EvaluationOutcome {
  scores: EvaluationScores;
  overallScore: number;
  result: QualityGateResult;
  reasons: string[];
  rationale: string;
}

/**
 * Faz o parse defensivo da resposta (potencialmente-JSON) do juiz.
 * Nunca lança: erros de formato/validação viram um resultado tipado.
 */
export function parseJudgeResponse(raw: string): JudgeParseResult {
  const extracted = extractJsonObject(raw);
  if (extracted === null) {
    return { success: false, error: 'nenhum objeto JSON encontrado na resposta do juiz' };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extracted);
  } catch {
    return { success: false, error: 'resposta do juiz não é um JSON válido' };
  }

  const result = judgeResponseSchema.safeParse(parsedJson);
  if (!result.success) {
    const messages = result.error.errors
      .map((e) => `${e.path.join('.') || 'raiz'}: ${e.message}`)
      .join('; ');
    return { success: false, error: `resposta do juiz inválida: ${messages}` };
  }

  return { success: true, data: result.data };
}

/**
 * Calcula o score geral como a média dos seis critérios, arredondada a 2 casas
 * decimais (ex.: 8.33).
 */
export function computeOverallScore(scores: EvaluationScores): number {
  const total = EVALUATION_CRITERIA.reduce((sum, criterion) => sum + scores[criterion], 0);
  const average = total / EVALUATION_CRITERIA.length;
  return Math.round(average * 100) / 100;
}

/**
 * Aplica o quality gate de forma objetiva e documentada.
 *
 * Regra de REJEIÇÃO (qualquer uma reprova):
 * 1. `overallScore` abaixo de {@link APPROVAL_THRESHOLD} (7.0);
 * 2. `requirementsAdherence` abaixo de {@link ADHERENCE_FLOOR} (5) — piso do
 *    critério crítico de aderência;
 * 3. qualquer critério igual a 0.
 *
 * Caso contrário, APROVADO. `reasons` lista os motivos (pt-BR) da reprovação e
 * fica vazio quando aprovado.
 */
export function evaluateQualityGate(scores: EvaluationScores): {
  result: QualityGateResult;
  overallScore: number;
  reasons: string[];
} {
  const overallScore = computeOverallScore(scores);
  const reasons: string[] = [];

  if (overallScore < APPROVAL_THRESHOLD) {
    reasons.push(
      `score geral ${overallScore.toFixed(2)} abaixo do minimo ${APPROVAL_THRESHOLD.toFixed(2)}`,
    );
  }

  if (scores.requirementsAdherence < ADHERENCE_FLOOR) {
    reasons.push(
      `aderência aos requisitos ${scores.requirementsAdherence.toString()} abaixo do piso ${ADHERENCE_FLOOR.toString()}`,
    );
  }

  const zeroed = EVALUATION_CRITERIA.filter((criterion) => scores[criterion] === 0);
  for (const criterion of zeroed) {
    reasons.push(`critério ${criterion} zerado`);
  }

  const result: QualityGateResult = reasons.length === 0 ? 'APPROVED' : 'REJECTED';
  return { result, overallScore, reasons };
}
