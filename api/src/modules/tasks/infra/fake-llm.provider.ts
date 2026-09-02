import {
  LlmProvider,
  LlmGenerationRequest,
  LlmGenerationResult,
  LlmMessage,
  LlmProviderError,
} from '../domain/llm-provider.port';

/**
 * Implementação de LlmProvider para testes e desenvolvimento offline.
 * Não faz nenhuma chamada de rede. Permite configurar a resposta, simular
 * falha e inspecionar as requisições recebidas.
 *
 * No fluxo real, um único FakeLlmProvider é compartilhado (via factory) tanto
 * para GERAÇÃO quanto para AVALIAÇÃO (LLM-as-Judge). Por isso, quando NENHUMA
 * resposta explícita é definida, o Fake inspeciona o prompt e responde conforme
 * o tipo (spec de geração vs. resposta de juiz). Um override explícito
 * (construtor com argumento ou `setResponse`) sempre tem prioridade.
 */
export class FakeLlmProvider implements LlmProvider {
  /** Resposta a retornar quando definida explicitamente pelo usuário. */
  private response: string;
  /** Indica se `response` foi definido explicitamente (override), não default. */
  private hasExplicitResponse: boolean;
  private shouldFail = false;
  private failureMessage = 'falha simulada do provider';
  readonly receivedRequests: LlmGenerationRequest[] = [];

  constructor(response?: string) {
    this.hasExplicitResponse = response !== undefined;
    this.response = response ?? FakeLlmProvider.defaultSpecJson();
  }

  setResponse(response: string): void {
    this.response = response;
    this.hasExplicitResponse = true;
  }

  simulateFailure(message?: string): void {
    this.shouldFail = true;
    if (message !== undefined) {
      this.failureMessage = message;
    }
  }

  generate(request: LlmGenerationRequest): Promise<LlmGenerationResult> {
    this.receivedRequests.push(request);

    if (this.shouldFail) {
      return Promise.reject(new LlmProviderError(this.failureMessage));
    }

    return Promise.resolve({
      content: this.resolveContent(request),
      model: 'fake-model',
      usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      latencyMs: 5,
    });
  }

  /**
   * Decide o conteúdo da resposta. Com override explícito, retorna-o tal qual;
   * caso contrário (modo default), infere o tipo de prompt para responder com
   * uma spec de geração ou uma resposta de juiz.
   */
  private resolveContent(request: LlmGenerationRequest): string {
    if (this.hasExplicitResponse) {
      return this.response;
    }

    return FakeLlmProvider.looksLikeJudgePrompt(request.messages)
      ? FakeLlmProvider.defaultJudgeJson()
      : FakeLlmProvider.defaultSpecJson();
  }

  /**
   * Heurística para distinguir um prompt de AVALIAÇÃO (LLM-as-Judge) de um de
   * GERAÇÃO. O prompt do juiz pede um JSON com `"scores"` e `"rationale"` e cita
   * o critério `requirementsAdherence`; o de geração pede a especificação e não
   * menciona nada disso.
   */
  private static looksLikeJudgePrompt(messages: LlmMessage[]): boolean {
    return messages.some((message) => {
      const content = message.content;
      return (
        (content.includes('scores') && content.includes('rationale')) ||
        content.includes('requirementsAdherence')
      );
    });
  }

  /** Um JSON de especificação válido, útil como resposta padrão nos testes. */
  static defaultSpecJson(): string {
    return JSON.stringify({
      title: 'Especificação gerada (fake)',
      context: 'Contexto de exemplo para testes offline.',
      objective: 'Demonstrar a geração sem depender do provider real.',
      functionalRequirements: ['Requisito funcional de exemplo'],
      nonFunctionalRequirements: ['Requisito não-funcional de exemplo'],
      acceptanceCriteria: ['Critério de aceite de exemplo'],
      technicalTasks: ['Tarefa técnica de exemplo'],
      risks: ['Risco de exemplo'],
      dependencies: ['Dependência de exemplo'],
      definitionOfDone: ['DoD de exemplo'],
    });
  }

  /**
   * Um JSON de resposta do juiz válido (scores altos coerentes + rationale),
   * útil como resposta padrão nos testes do LLM-as-Judge. Aceita overrides
   * parciais de scores. A porta é a mesma (LlmProvider), então o FakeLlmProvider
   * é reutilizado tanto para geração quanto para avaliação.
   */
  static defaultJudgeJson(scoreOverrides?: Partial<Record<string, number>>): string {
    const scores: Record<string, number> = {
      clarity: 9,
      completeness: 8,
      consistency: 9,
      testability: 8,
      risks: 8,
      requirementsAdherence: 9,
      ...scoreOverrides,
    };

    return JSON.stringify({
      scores,
      rationale: 'Especificação clara, completa e aderente à necessidade original.',
    });
  }
}
