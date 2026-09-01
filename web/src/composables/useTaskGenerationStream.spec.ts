import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defineComponent } from 'vue';
import { render } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { useTaskGenerationStream, type UseTaskGenerationStream } from './useTaskGenerationStream';
import type { TaskSpecification } from '@/services/task-events';

// --- Mock de EventSource -------------------------------------------------

const OPEN = 1;
const CLOSED = 2;

/**
 * Fake de EventSource: registra listeners por nome e expõe métodos para
 * disparar eventos manualmente nos testes. O jsdom não tem EventSource real.
 */
class FakeEventSource {
  static instances: FakeEventSource[] = [];

  url: string;
  readyState = OPEN;
  onerror: ((event: Event) => void) | null = null;
  closeSpy = vi.fn();

  private listeners = new Map<string, Set<(event: MessageEvent) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(name: string, handler: (event: MessageEvent) => void): void {
    if (!this.listeners.has(name)) {
      this.listeners.set(name, new Set());
    }
    this.listeners.get(name)?.add(handler);
  }

  removeEventListener(name: string, handler: (event: MessageEvent) => void): void {
    this.listeners.get(name)?.delete(handler);
  }

  close(): void {
    this.readyState = CLOSED;
    this.closeSpy();
  }

  /** Dispara um evento nomeado com o `data` fornecido. */
  emit(name: string, data: unknown): void {
    const raw = typeof data === 'string' ? data : JSON.stringify(data);
    const event = { data: raw } as MessageEvent;
    for (const handler of this.listeners.get(name) ?? []) {
      handler(event);
    }
  }

  /** Simula erro de transporte. */
  emitError(): void {
    this.onerror?.(new Event('error'));
  }

  static latest(): FakeEventSource {
    return FakeEventSource.instances[FakeEventSource.instances.length - 1];
  }

  static reset(): void {
    FakeEventSource.instances = [];
  }
}

// --- Host mínimo para dar contexto de lifecycle ao composable ------------

function mountComposable(): { api: UseTaskGenerationStream; unmount: () => void } {
  let api!: UseTaskGenerationStream;
  const Host = defineComponent({
    setup() {
      api = useTaskGenerationStream();
      return () => null;
    },
  });
  const { unmount } = render(Host);
  return { api, unmount };
}

function makeSpecification(): TaskSpecification {
  return {
    title: 'Título',
    context: 'Contexto',
    objective: 'Objetivo',
    functionalRequirements: ['RF1'],
    nonFunctionalRequirements: ['RNF1'],
    acceptanceCriteria: ['CA1'],
    technicalTasks: ['TT1'],
    risks: ['R1'],
    dependencies: ['D1'],
    definitionOfDone: ['DoD1'],
  };
}

const BASE = { runId: 'run-1', timestamp: '2024-01-01T00:00:00Z' };

beforeEach(() => {
  FakeEventSource.reset();
  vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useTaskGenerationStream', () => {
  it('deve concluir e fechar a conexão ao receber a sequência até completed', async () => {
    const { api } = mountComposable();

    api.start('task-1', 'token-abc');
    const es = FakeEventSource.latest();

    es.emit('started', { event: 'started', ...BASE });
    es.emit('analyzing_context', { event: 'analyzing_context', ...BASE, message: 'ok' });
    const specification = makeSpecification();
    es.emit('completed', {
      event: 'completed',
      ...BASE,
      taskId: 'task-1',
      specification,
    });
    await flushPromises();

    expect(api.status.value).toBe('completed');
    expect(api.specification.value).toEqual(specification);
    expect(es.closeSpy).toHaveBeenCalledTimes(1);
  });

  it('deve marcar falha e fechar ao receber evento failed', async () => {
    const { api } = mountComposable();

    api.start('task-1', 'token-abc');
    const es = FakeEventSource.latest();

    es.emit('started', { event: 'started', ...BASE });
    es.emit('failed', {
      event: 'failed',
      ...BASE,
      taskId: 'task-1',
      error: 'geração falhou',
    });
    await flushPromises();

    expect(api.status.value).toBe('failed');
    expect(api.error.value).toBe('geração falhou');
    expect(es.closeSpy).toHaveBeenCalledTimes(1);
  });

  it('deve entrar em erro e fechar em falha de transporte sem termo', async () => {
    const { api } = mountComposable();

    api.start('task-1', 'token-abc');
    const es = FakeEventSource.latest();

    es.emit('started', { event: 'started', ...BASE });
    es.emitError();
    await flushPromises();

    expect(api.status.value).toBe('error');
    expect(api.error.value).not.toBeNull();
    expect(es.closeSpy).toHaveBeenCalledTimes(1);
  });

  it('deve fechar a conexão ao chamar stop()', () => {
    const { api } = mountComposable();

    api.start('task-1', 'token-abc');
    const es = FakeEventSource.latest();
    api.stop();

    expect(es.closeSpy).toHaveBeenCalledTimes(1);
  });

  it('deve fechar a conexão anterior ao chamar start() novamente', () => {
    const { api } = mountComposable();

    api.start('task-1', 'token-abc');
    const first = FakeEventSource.latest();
    api.start('task-2', 'token-def');
    const second = FakeEventSource.latest();

    expect(first.closeSpy).toHaveBeenCalledTimes(1);
    expect(first).not.toBe(second);
    expect(second.url).toContain('task-2');
  });

  it('deve montar a URL com o token codificado na query string', () => {
    const { api } = mountComposable();

    api.start('task-1', 'a b/c');
    const es = FakeEventSource.latest();

    expect(es.url).toBe('/api/tasks/task-1/stream?token=a%20b%2Fc');
  });

  it('deve ignorar payload inválido (data não-JSON) sem quebrar', async () => {
    const { api } = mountComposable();

    api.start('task-1', 'token-abc');
    const es = FakeEventSource.latest();

    es.emit('started', 'isso-nao-e-json');
    await flushPromises();

    expect(api.events.value).toHaveLength(0);
    expect(api.currentEvent.value).toBeNull();
    expect(api.status.value).toBe('connecting');
  });

  it('deve fechar a conexão ao desmontar o componente host', () => {
    const { api, unmount } = mountComposable();

    api.start('task-1', 'token-abc');
    const es = FakeEventSource.latest();
    unmount();

    expect(es.closeSpy).toHaveBeenCalledTimes(1);
  });
});
