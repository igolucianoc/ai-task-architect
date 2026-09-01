import { type TaskSpecification } from './task-specification';

/**
 * Contrato dos eventos de progresso da geração de especificação.
 *
 * Estes eventos são transportados depois via Server-Sent Events (SSE). Esta
 * fatia define apenas o contrato de tipos; o emissor e o endpoint são fatias
 * posteriores. A discriminação é feita pelo campo `event`.
 */

/**
 * Nomes possíveis de evento. Usamos `as const` + union de string literal em vez
 * de `enum` para manter o contrato como valores de string simples (amigável a
 * serialização SSE) e sem gerar runtime extra.
 */
export const TASK_GENERATION_EVENT_NAMES = [
  'started',
  'analyzing_context',
  'generating_requirements',
  'generating_acceptance_criteria',
  'evaluating',
  'completed',
  'failed',
] as const;

export type TaskGenerationEventName = (typeof TASK_GENERATION_EVENT_NAMES)[number];

/**
 * Ordem das fases de progresso (exclui os terminais `completed`/`failed`).
 * Útil para o emissor da próxima fatia e para testes.
 */
export const TASK_GENERATION_PROGRESS_PHASES = [
  'started',
  'analyzing_context',
  'generating_requirements',
  'generating_acceptance_criteria',
  'evaluating',
] as const;

export type TaskGenerationProgressPhase = (typeof TASK_GENERATION_PROGRESS_PHASES)[number];

/**
 * Campos comuns a todos os eventos.
 * - `runId`: id de correlação da execução (uma geração = um runId).
 * - `timestamp`: data/hora do evento em ISO 8601.
 */
export interface TaskGenerationEventBase {
  event: TaskGenerationEventName;
  runId: string;
  timestamp: string;
}

/** Evento de fase intermediária: carrega um rótulo humano opcional. */
export interface TaskGenerationProgressEvent extends TaskGenerationEventBase {
  event: TaskGenerationProgressPhase;
  message?: string;
}

/** Evento terminal de sucesso: entrega a especificação gerada. */
export interface TaskGenerationCompletedEvent extends TaskGenerationEventBase {
  event: 'completed';
  taskId: string;
  specification: TaskSpecification;
}

/** Evento terminal de falha: descreve o erro. */
export interface TaskGenerationFailedEvent extends TaskGenerationEventBase {
  event: 'failed';
  taskId: string;
  error: string;
}

/**
 * União discriminada de todos os eventos de geração, discriminados por `event`.
 */
export type TaskGenerationEvent =
  TaskGenerationProgressEvent | TaskGenerationCompletedEvent | TaskGenerationFailedEvent;

/**
 * Payload de cada variante de evento sem o `timestamp` (preenchido por
 * `buildEvent`). Distributive conditional type: cada variante da união perde
 * apenas seu próprio `timestamp`, preservando a discriminação por `event`.
 */
type EventInput<E extends TaskGenerationEvent = TaskGenerationEvent> = E extends E
  ? Omit<E, 'timestamp'>
  : never;

/**
 * Factory que cria um evento preenchendo o `timestamp` com o instante atual
 * (ISO 8601). Sobrecargas por variante garantem que o retorno preserve o tipo
 * exato do evento (progresso, completed ou failed) conforme o `input`.
 */
export function buildEvent(
  input: Omit<TaskGenerationProgressEvent, 'timestamp'>,
): TaskGenerationProgressEvent;
export function buildEvent(
  input: Omit<TaskGenerationCompletedEvent, 'timestamp'>,
): TaskGenerationCompletedEvent;
export function buildEvent(
  input: Omit<TaskGenerationFailedEvent, 'timestamp'>,
): TaskGenerationFailedEvent;
export function buildEvent(input: EventInput): TaskGenerationEvent {
  return {
    ...input,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Indica se o evento encerra o stream. O cliente SSE fecha a conexão ao
 * receber um evento terminal (`completed` ou `failed`).
 */
export function isTerminalEvent(event: TaskGenerationEvent): boolean {
  return event.event === 'completed' || event.event === 'failed';
}
