import { z } from 'zod';

/**
 * Contrato do domínio para a especificação técnica gerada pela IA.
 *
 * A saída do LLM NÃO é confiável: este schema é a fronteira que valida e
 * normaliza o JSON retornado antes de qualquer persistência. Campos opcionais
 * refletem o prompt 05 ("quando aplicável"); os obrigatórios garantem que uma
 * especificação mínima e útil sempre exista.
 */
export const taskSpecificationSchema = z
  .object({
    title: z.string().trim().min(1, 'título é obrigatório').max(200),
    context: z.string().trim().min(1, 'contexto é obrigatório'),
    objective: z.string().trim().min(1, 'objetivo é obrigatório'),
    functionalRequirements: z.array(z.string().trim().min(1)).default([]),
    nonFunctionalRequirements: z.array(z.string().trim().min(1)).default([]),
    acceptanceCriteria: z
      .array(z.string().trim().min(1))
      .min(1, 'ao menos um critério de aceite é obrigatório'),
    technicalTasks: z.array(z.string().trim().min(1)).default([]),
    risks: z.array(z.string().trim().min(1)).default([]),
    dependencies: z.array(z.string().trim().min(1)).default([]),
    definitionOfDone: z.array(z.string().trim().min(1)).default([]),
  })
  .strip();

export type TaskSpecification = z.infer<typeof taskSpecificationSchema>;

export type SpecParseResult =
  { success: true; data: TaskSpecification } | { success: false; error: string };

/**
 * Faz o parse defensivo de uma string potencialmente-JSON vinda do LLM.
 * Nunca lança: erros de formato/validação viram um resultado tipado.
 */
export function parseTaskSpecification(raw: string): SpecParseResult {
  const extracted = extractJsonObject(raw);
  if (extracted === null) {
    return { success: false, error: 'nenhum objeto JSON encontrado na resposta do modelo' };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extracted);
  } catch {
    return { success: false, error: 'resposta do modelo não é um JSON válido' };
  }

  const result = taskSpecificationSchema.safeParse(parsedJson);
  if (!result.success) {
    const messages = result.error.errors
      .map((e) => `${e.path.join('.') || 'raiz'}: ${e.message}`)
      .join('; ');
    return { success: false, error: `especificação inválida: ${messages}` };
  }

  return { success: true, data: result.data };
}

/**
 * Modelos frequentemente embrulham o JSON em cercas markdown ou texto.
 * Extrai o primeiro objeto JSON balanceado da string, se houver.
 */
export function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i++) {
    const char = raw[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return raw.slice(start, i + 1);
      }
    }
  }

  return null;
}
