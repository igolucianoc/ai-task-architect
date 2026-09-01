// Tipos e utilitários de acesso a dados para o streaming SSE de geração de tarefas.
// Espelha o contrato de eventos do backend (GET /api/tasks/:id/stream).

/**
 * Especificação gerada, entregue no evento terminal `completed`.
 * Campos textuais são strings; os demais são listas de strings.
 */
export interface TaskSpecification {
  title: string;
  context: string;
  objective: string;
  functionalRequirements: string[];
  nonFunctionalRequirements: string[];
  acceptanceCriteria: string[];
  technicalTasks: string[];
  risks: string[];
  dependencies: string[];
  definitionOfDone: string[];
}

/** Nomes de evento de progresso (não terminais). */
export type TaskProgressEventName =
  | 'started'
  | 'analyzing_context'
  | 'generating_requirements'
  | 'generating_acceptance_criteria'
  | 'evaluating';

/** Nomes de evento terminais — ao recebê-los o cliente encerra a conexão. */
export type TaskTerminalEventName = 'completed' | 'failed';

/** Todos os nomes de evento do contrato. */
export type TaskEventName = TaskProgressEventName | TaskTerminalEventName;

/** Campos comuns a todo evento do contrato. */
interface TaskEventBase {
  runId: string;
  timestamp: string;
}

/** Evento de progresso: pode trazer uma mensagem opcional. */
export interface TaskProgressEvent extends TaskEventBase {
  event: TaskProgressEventName;
  message?: string;
}

/** Evento terminal de sucesso: traz a especificação gerada. */
export interface TaskCompletedEvent extends TaskEventBase {
  event: 'completed';
  taskId: string;
  specification: TaskSpecification;
}

/** Evento terminal de falha de domínio: traz a mensagem de erro. */
export interface TaskFailedEvent extends TaskEventBase {
  event: 'failed';
  taskId: string;
  error: string;
}

/** União discriminada por `event` de todos os eventos possíveis. */
export type TaskGenerationEvent = TaskProgressEvent | TaskCompletedEvent | TaskFailedEvent;

/** Conjunto de nomes terminais, para checagem em runtime. */
const TERMINAL_EVENT_NAMES: ReadonlySet<TaskEventName> = new Set<TaskEventName>([
  'completed',
  'failed',
]);

/**
 * Type guard: indica se o evento é terminal (`completed` ou `failed`).
 * Estreita o tipo para os eventos terminais.
 */
export function isTerminalEvent(
  event: TaskGenerationEvent,
): event is TaskCompletedEvent | TaskFailedEvent {
  return TERMINAL_EVENT_NAMES.has(event.event);
}

/** Nomes válidos para parsing, evitando confiar cegamente no payload. */
const VALID_EVENT_NAMES: ReadonlySet<string> = new Set<TaskEventName>([
  'started',
  'analyzing_context',
  'generating_requirements',
  'generating_acceptance_criteria',
  'evaluating',
  'completed',
  'failed',
]);

/** Checa se um valor é um objeto (não nulo, não array). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Valida os campos base (`runId`, `timestamp`) presentes em todo evento. */
function hasEventBase(value: Record<string, unknown>): boolean {
  return typeof value.runId === 'string' && typeof value.timestamp === 'string';
}

/** Checa se um valor é um array de strings. */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Valida defensivamente o objeto de especificação do evento `completed`. */
function isTaskSpecification(value: unknown): value is TaskSpecification {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.title === 'string' &&
    typeof value.context === 'string' &&
    typeof value.objective === 'string' &&
    isStringArray(value.functionalRequirements) &&
    isStringArray(value.nonFunctionalRequirements) &&
    isStringArray(value.acceptanceCriteria) &&
    isStringArray(value.technicalTasks) &&
    isStringArray(value.risks) &&
    isStringArray(value.dependencies) &&
    isStringArray(value.definitionOfDone)
  );
}

/**
 * Parser defensivo: recebe o nome do evento SSE e o `data` bruto (string),
 * faz JSON.parse e valida o formato esperado. Retorna `null` para qualquer
 * payload inválido — nunca confia cegamente no conteúdo recebido.
 */
export function parseTaskEvent(name: string, raw: string): TaskGenerationEvent | null {
  if (!VALID_EVENT_NAMES.has(name)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || !hasEventBase(parsed)) {
    return null;
  }

  // O nome vindo do listener é a fonte de verdade; o `event` do payload deve coincidir.
  if (parsed.event !== name) {
    return null;
  }

  if (name === 'completed') {
    if (typeof parsed.taskId === 'string' && isTaskSpecification(parsed.specification)) {
      return {
        event: 'completed',
        runId: parsed.runId as string,
        timestamp: parsed.timestamp as string,
        taskId: parsed.taskId,
        specification: parsed.specification,
      };
    }
    return null;
  }

  if (name === 'failed') {
    if (typeof parsed.taskId === 'string' && typeof parsed.error === 'string') {
      return {
        event: 'failed',
        runId: parsed.runId as string,
        timestamp: parsed.timestamp as string,
        taskId: parsed.taskId,
        error: parsed.error,
      };
    }
    return null;
  }

  // Eventos de progresso: `message` é opcional.
  const message = typeof parsed.message === 'string' ? parsed.message : undefined;
  return {
    event: name as TaskProgressEventName,
    runId: parsed.runId as string,
    timestamp: parsed.timestamp as string,
    ...(message !== undefined ? { message } : {}),
  };
}
