/**
 * Porta do domínio para o provider de LLM.
 *
 * O domínio depende desta interface, nunca do SDK concreto (Hugging Face).
 * A implementação é injetada via DI (ver infra/huggingface). Isso mantém o
 * núcleo testável (FakeLLMProvider) e independente do fornecedor.
 */

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmGenerationRequest {
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
}

/**
 * Uso de tokens reportado pelo provider, quando disponível.
 * Usado apenas para observabilidade/custo — nunca contém o token de acesso.
 */
export interface LlmUsageMetrics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmGenerationResult {
  content: string;
  model: string;
  usage: LlmUsageMetrics | null;
  latencyMs: number;
}

/**
 * Erro de domínio para falhas do provider. A camada de infra traduz erros
 * específicos do SDK para este tipo, sem vazar detalhes sensíveis (token).
 */
export class LlmProviderError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LlmProviderError';
  }
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export interface LlmProvider {
  /**
   * Gera uma resposta completa (sem streaming) a partir das mensagens.
   * Deve lançar LlmProviderError em caso de falha do provider.
   */
  generate(request: LlmGenerationRequest): Promise<LlmGenerationResult>;
}
