import { LlmMessage } from '../domain/llm-provider.port';

/**
 * Monta as mensagens enviadas ao LLM para gerar uma especificação técnica.
 * O system prompt instrui o formato JSON exato esperado pelo schema de domínio.
 *
 * Nota de segurança: o prompt NÃO é uma fronteira de segurança. A saída do
 * modelo é validada por parseTaskSpecification antes de qualquer persistência.
 */
export function buildGenerationMessages(description: string): LlmMessage[] {
  const system = [
    'Você é um arquiteto de software sênior. A partir de uma necessidade técnica descrita em',
    'linguagem natural, produza uma especificação de implementação estruturada.',
    '',
    'Responda EXCLUSIVAMENTE com um objeto JSON válido, sem texto antes ou depois, sem cercas',
    'markdown. O JSON deve ter exatamente estas chaves:',
    '',
    '{',
    '  "title": string,',
    '  "context": string,',
    '  "objective": string,',
    '  "functionalRequirements": string[],',
    '  "nonFunctionalRequirements": string[],',
    '  "acceptanceCriteria": string[],',
    '  "technicalTasks": string[],',
    '  "risks": string[],',
    '  "dependencies": string[],',
    '  "definitionOfDone": string[]',
    '}',
    '',
    'Regras:',
    '- title, context, objective e ao menos um acceptanceCriteria são obrigatórios.',
    '- Cada item de array deve ser uma frase objetiva e acionável.',
    '- Escreva em português.',
    '- Não invente requisitos fora do escopo da necessidade informada.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: `Necessidade técnica:\n${description}` },
  ];
}
