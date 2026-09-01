import {
  LlmProvider,
  LlmGenerationRequest,
  LlmGenerationResult,
  LlmProviderError,
} from '../application/llm-provider.port';

/**
 * Implementação de LlmProvider para testes e desenvolvimento offline.
 * Não faz nenhuma chamada de rede. Permite configurar a resposta, simular
 * falha e inspecionar as requisições recebidas.
 */
export class FakeLlmProvider implements LlmProvider {
  private response: string;
  private shouldFail = false;
  private failureMessage = 'falha simulada do provider';
  readonly receivedRequests: LlmGenerationRequest[] = [];

  constructor(response?: string) {
    this.response = response ?? FakeLlmProvider.defaultSpecJson();
  }

  setResponse(response: string): void {
    this.response = response;
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
      content: this.response,
      model: 'fake-model',
      usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      latencyMs: 5,
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
