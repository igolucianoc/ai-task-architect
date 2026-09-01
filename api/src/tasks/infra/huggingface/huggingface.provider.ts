import { Logger } from '@nestjs/common';
import { InferenceClient, InferenceClientError } from '@huggingface/inference';
import {
  LlmProvider,
  LlmGenerationRequest,
  LlmGenerationResult,
  LlmProviderError,
  LlmUsageMetrics,
} from '../../domain/ports/llm-provider.port';

export interface HuggingFaceProviderConfig {
  token: string;
  model: string;
}

/**
 * Implementação de LlmProvider sobre a biblioteca oficial @huggingface/inference.
 *
 * Fonte (doc oficial, v4):
 * https://huggingface.co/docs/huggingface.js/main/en/inference/README
 *   - `new InferenceClient(accessToken)`
 *   - `chatCompletion({ model, messages, max_tokens, temperature })`
 *   - resposta em `choices[0].message.content` e `usage`
 *   - erros estendem `InferenceClientError`
 *
 * Regras de segurança (prompts/huggingface-access-token.md):
 *   - o token vem do construtor via DI; esta classe NUNCA lê process.env
 *   - o token nunca é logado, nem parcialmente
 */
export class HuggingFaceProvider implements LlmProvider {
  private readonly logger = new Logger(HuggingFaceProvider.name);
  private readonly client: InferenceClient;
  private readonly model: string;

  constructor(config: HuggingFaceProviderConfig) {
    this.client = new InferenceClient(config.token);
    this.model = config.model;
  }

  async generate(request: LlmGenerationRequest): Promise<LlmGenerationResult> {
    const startedAt = Date.now();

    try {
      const response = await this.client.chatCompletion({
        model: this.model,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: request.maxTokens,
        temperature: request.temperature,
      });

      const latencyMs = Date.now() - startedAt;
      const content = response.choices[0]?.message.content ?? '';
      const usage = this.mapUsage(response.usage);

      return { content, model: this.model, usage, latencyMs };
    } catch (error) {
      // Traduz erros do SDK para o erro de domínio, sem expor token/stack sensível.
      const message = this.describeError(error);
      this.logger.error(`chatCompletion falhou model=${this.model}: ${message}`);
      throw new LlmProviderError(message, error);
    }
  }

  private mapUsage(usage: unknown): LlmUsageMetrics | null {
    if (usage === null || typeof usage !== 'object') {
      return null;
    }
    const u = usage as {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
    if (
      typeof u.prompt_tokens !== 'number' ||
      typeof u.completion_tokens !== 'number' ||
      typeof u.total_tokens !== 'number'
    ) {
      return null;
    }
    return {
      promptTokens: u.prompt_tokens,
      completionTokens: u.completion_tokens,
      totalTokens: u.total_tokens,
    };
  }

  private describeError(error: unknown): string {
    if (error instanceof InferenceClientError) {
      return `erro do provider Hugging Face: ${error.message}`;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return 'erro desconhecido ao chamar o provider';
  }
}
