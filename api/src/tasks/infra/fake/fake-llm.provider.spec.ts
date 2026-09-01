import { describe, it, expect } from 'vitest';
import { FakeLlmProvider } from './fake-llm.provider';
import { LlmProviderError } from '../../domain/ports/llm-provider.port';
import { parseTaskSpecification } from '../../domain/task-specification';

describe('FakeLlmProvider', () => {
  it('retorna por padrão uma especificação JSON válida e parseável', async () => {
    const provider = new FakeLlmProvider();

    const result = await provider.generate({
      messages: [{ role: 'user', content: 'gere' }],
    });

    expect(result.model).toBe('fake-model');
    expect(result.usage?.totalTokens).toBe(300);
    const parsed = parseTaskSpecification(result.content);
    expect(parsed.success).toBe(true);
  });

  it('permite configurar uma resposta customizada', async () => {
    const provider = new FakeLlmProvider('resposta arbitrária');

    const result = await provider.generate({ messages: [{ role: 'user', content: 'x' }] });

    expect(result.content).toBe('resposta arbitrária');
  });

  it('simula falha do provider lançando LlmProviderError', async () => {
    const provider = new FakeLlmProvider();
    provider.simulateFailure('provider indisponível');

    await expect(
      provider.generate({ messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toBeInstanceOf(LlmProviderError);
  });

  it('registra as requisições recebidas para inspeção nos testes', async () => {
    const provider = new FakeLlmProvider();

    await provider.generate({
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'necessidade' },
      ],
      temperature: 0.2,
    });

    expect(provider.receivedRequests).toHaveLength(1);
    expect(provider.receivedRequests[0].messages[1].content).toBe('necessidade');
    expect(provider.receivedRequests[0].temperature).toBe(0.2);
  });
});
