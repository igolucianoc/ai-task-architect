import { LlmMessage } from './llm-provider.port';
import { TaskSpecification } from './task-specification';

/**
 * Versão do prompt do juiz. É persistida junto da avaliação para permitir
 * rastreabilidade e comparação entre versões do prompt ao longo do tempo.
 */
export const JUDGE_PROMPT_VERSION = 'judge-v1';

/**
 * Monta as mensagens enviadas ao LLM que atua como JUIZ (LLM-as-Judge).
 *
 * Princípio de INDEPENDÊNCIA (requisito do prompt 07): o juiz é um avaliador
 * crítico independente. Ele recebe SOMENTE (a) a necessidade original do
 * usuário e (b) a especificação gerada (serializada como JSON). O prompt do
 * juiz NÃO reutiliza o system prompt do gerador nem instruções de geração,
 * evitando viés — o juiz avalia o resultado, não repete o raciocínio de quem
 * gerou.
 *
 * Nota de segurança: o prompt NÃO é uma fronteira de segurança. A saída do
 * juiz será validada por `parseJudgeResponse` (task-evaluation.ts) antes de
 * qualquer cálculo ou persistência — nunca confie cegamente no modelo.
 */
export function buildJudgeMessages(input: {
  description: string;
  specification: TaskSpecification;
}): LlmMessage[] {
  const system = [
    'Você é um avaliador técnico rigoroso e imparcial. Sua função é julgar criticamente,',
    'sem indulgência, uma especificação técnica produzida por outro modelo.',
    '',
    'Avalie a especificação segundo os SEIS critérios abaixo:',
    '- clarity: quão clara e inequívoca é a especificação.',
    '- completeness: quão completa é, cobrindo todos os aspectos necessários.',
    '- consistency: quão coerente é internamente, sem contradições.',
    '- testability: quão verificáveis e mensuráveis são os critérios de aceite.',
    '- risks: quão bem os riscos relevantes foram identificados e tratados.',
    '- requirementsAdherence: quão bem a especificação atende à necessidade original do usuário.',
    '',
    'Pontue CADA critério com um número INTEIRO de 0 a 10 (0 = ausente/inaceitável, 10 = excelente).',
    '',
    'Responda EXCLUSIVAMENTE com um objeto JSON válido, sem texto antes ou depois, sem cercas',
    'markdown. O JSON deve ter exatamente este formato:',
    '',
    '{',
    '  "scores": {',
    '    "clarity": n,',
    '    "completeness": n,',
    '    "consistency": n,',
    '    "testability": n,',
    '    "risks": n,',
    '    "requirementsAdherence": n',
    '  },',
    '  "rationale": "justificativa curta"',
    '}',
  ].join('\n');

  const user = [
    'Necessidade original do usuário:',
    input.description,
    '',
    'Especificação gerada (JSON):',
    JSON.stringify(input.specification, null, 2),
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
