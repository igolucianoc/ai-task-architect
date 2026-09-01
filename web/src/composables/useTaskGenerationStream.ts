import { onUnmounted, readonly, ref, type DeepReadonly, type Ref } from 'vue';
import {
  isTerminalEvent,
  parseTaskEvent,
  type TaskEventName,
  type TaskGenerationEvent,
  type TaskSpecification,
} from '@/services/task-events';

/** Status observável da conexão de streaming. */
export type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'completed' | 'failed' | 'error';

/** Nomes de evento do contrato para os quais registramos listeners. */
const EVENT_NAMES: readonly TaskEventName[] = [
  'started',
  'analyzing_context',
  'generating_requirements',
  'generating_acceptance_criteria',
  'evaluating',
  'completed',
  'failed',
];

/** API pública do composable. */
export interface UseTaskGenerationStream {
  /** Lista, em ordem de chegada, dos eventos válidos recebidos. */
  events: DeepReadonly<Ref<TaskGenerationEvent[]>>;
  /** Status atual da conexão. */
  status: Readonly<Ref<StreamStatus>>;
  /** Especificação preenchida ao concluir; `null` caso contrário. */
  specification: DeepReadonly<Ref<TaskSpecification | null>>;
  /** Mensagem de erro em caso de falha de domínio ou de transporte. */
  error: Readonly<Ref<string | null>>;
  /** Último evento recebido; `null` antes do primeiro. */
  currentEvent: DeepReadonly<Ref<TaskGenerationEvent | null>>;
  /** Abre a conexão SSE para a tarefa. Fecha qualquer conexão anterior antes. */
  start: (taskId: string, token: string) => void;
  /** Fecha a conexão e limpa listeners. */
  stop: () => void;
}

/**
 * Composable de acesso ao streaming SSE de geração de tarefas.
 *
 * Uso: deve ser chamado dentro de `setup()` — registra cleanup em `onUnmounted`,
 * fechando a conexão automaticamente quando o componente é desmontado.
 *
 * Reconexão: o `EventSource` nativo reconecta sozinho por padrão. Como esta
 * versão NÃO retoma por `Last-Event-ID` e a geração não deve ser reprocessada,
 * não deixamos o navegador reabrir a conexão. Usamos a flag `settled`: após um
 * evento terminal (`completed`/`failed`), qualquer `onerror` apenas fecha. Se o
 * `onerror` disparar sem termo e o `readyState` for `CLOSED`, marcamos status
 * `error` e fechamos — evitando o loop infinito de reconexão do navegador.
 */
export function useTaskGenerationStream(): UseTaskGenerationStream {
  const events = ref<TaskGenerationEvent[]>([]);
  const status = ref<StreamStatus>('idle');
  const specification = ref<TaskSpecification | null>(null);
  const error = ref<string | null>(null);
  const currentEvent = ref<TaskGenerationEvent | null>(null);

  let source: EventSource | null = null;
  // Indica que já recebemos um evento terminal; impede reabertura em transporte.
  let settled = false;
  // Guarda os handlers registrados para removê-los ao fechar.
  const listeners = new Map<TaskEventName, (event: MessageEvent) => void>();

  /** Remove listeners e fecha o EventSource atual, se existir. */
  function closeSource(): void {
    if (source === null) {
      return;
    }
    for (const [name, handler] of listeners) {
      source.removeEventListener(name, handler);
    }
    listeners.clear();
    source.onerror = null;
    source.close();
    source = null;
  }

  /** Fecha a conexão e limpa listeners. Idempotente. */
  function stop(): void {
    closeSource();
  }

  /** Cria o handler para um nome de evento específico. */
  function makeHandler(name: TaskEventName): (event: MessageEvent) => void {
    return (event: MessageEvent) => {
      const parsed = parseTaskEvent(name, event.data);
      // Payload inválido é ignorado — não quebra o fluxo.
      if (parsed === null) {
        return;
      }

      events.value.push(parsed);
      currentEvent.value = parsed;

      if (isTerminalEvent(parsed)) {
        settled = true;
        if (parsed.event === 'completed') {
          specification.value = parsed.specification;
          status.value = 'completed';
        } else {
          error.value = parsed.error;
          status.value = 'failed';
        }
        closeSource();
        return;
      }

      // Progresso: uma vez conectado, estamos em streaming.
      status.value = 'streaming';
    };
  }

  /** Handler de erro de transporte/conexão. */
  function handleError(): void {
    // Após um evento terminal, apenas garantimos o fechamento sem tratar como erro.
    if (settled) {
      closeSource();
      return;
    }

    // Sem termo: se o navegador fechou de vez, reportamos erro e não reabrimos.
    // Em CONNECTING o navegador tentaria reconectar; cortamos esse loop fechando.
    error.value = 'Falha na conexão com o streaming de geração.';
    status.value = 'error';
    closeSource();
  }

  /** Abre a conexão SSE. Fecha qualquer conexão anterior (idempotência). */
  function start(taskId: string, token: string): void {
    // Fecha conexão anterior antes de abrir outra.
    closeSource();

    // Reseta o estado observável para uma nova execução.
    events.value = [];
    specification.value = null;
    error.value = null;
    currentEvent.value = null;
    settled = false;
    status.value = 'connecting';

    const url = `/api/tasks/${taskId}/stream?token=${encodeURIComponent(token)}`;
    source = new EventSource(url);

    for (const name of EVENT_NAMES) {
      const handler = makeHandler(name);
      listeners.set(name, handler);
      source.addEventListener(name, handler);
    }

    source.onerror = handleError;
  }

  // Fecha automaticamente quando o componente host é desmontado.
  onUnmounted(() => {
    closeSource();
  });

  return {
    events: readonly(events),
    status: readonly(status),
    specification: readonly(specification),
    error: readonly(error),
    currentEvent: readonly(currentEvent),
    start,
    stop,
  };
}
