import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock do SDK oficial: nenhum teste faz chamada de rede real.
const chatCompletionMock = vi.fn();

vi.mock('@huggingface/inference', () => {
  class InferenceClientError extends Error {}
  return {
    InferenceClient: class {
      chatCompletion = chatCompletionMock;
    },
    InferenceClientError,
  };
});

import { HuggingFaceProvider } from '../infra/huggingface.provider';
import { LlmProviderError } from '../domain/llm-provider.port';

describe('HuggingFaceProvider', () => {
  let provider: HuggingFaceProvider;

  beforeEach(() => {
    chatCompletionMock.mockReset();
    provider = new HuggingFaceProvider({ token: 'hf_fake', model: 'test/model' });
  });

  it('mapeia a resposta do SDK para LlmGenerationResult', async () => {
    chatCompletionMock.mockResolvedValue({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    });

    const result = await provider.generate({
      messages: [{ role: 'user', content: 'oi' }],
      maxTokens: 100,
      temperature: 0.3,
    });

    expect(result.content).toBe('{"ok":true}');
    expect(result.model).toBe('test/model');
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('envia model, mensagens e parâmetros ao SDK', async () => {
    chatCompletionMock.mockResolvedValue({
      choices: [{ message: { content: 'x' } }],
      usage: null,
    });

    await provider.generate({
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'necessidade' },
      ],
      maxTokens: 500,
      temperature: 0.2,
    });

    expect(chatCompletionMock).toHaveBeenCalledWith({
      model: 'test/model',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'necessidade' },
      ],
      max_tokens: 500,
      temperature: 0.2,
    });
  });

  it('retorna usage null quando o SDK não fornece uso', async () => {
    chatCompletionMock.mockResolvedValue({
      choices: [{ message: { content: 'x' } }],
      usage: null,
    });

    const result = await provider.generate({ messages: [{ role: 'user', content: 'x' }] });

    expect(result.usage).toBeNull();
  });

  it('traduz erro do SDK para LlmProviderError sem vazar detalhes sensíveis', async () => {
    chatCompletionMock.mockRejectedValue(new Error('429 Too Many Requests'));

    await expect(
      provider.generate({ messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toBeInstanceOf(LlmProviderError);
  });

  it('lida com content ausente retornando string vazia', async () => {
    chatCompletionMock.mockResolvedValue({ choices: [], usage: null });

    const result = await provider.generate({ messages: [{ role: 'user', content: 'x' }] });

    expect(result.content).toBe('');
  });
});
