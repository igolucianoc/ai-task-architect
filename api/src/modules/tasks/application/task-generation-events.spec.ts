import { describe, it, expect } from 'vitest';
import {
  TASK_GENERATION_EVENT_NAMES,
  TASK_GENERATION_PROGRESS_PHASES,
  buildEvent,
  isTerminalEvent,
  type TaskGenerationEvent,
  type TaskGenerationEventName,
} from '../domain/task-generation-events';
import { type TaskSpecification } from '../domain/task-specification';

const runId = 'run-123';

const specification: TaskSpecification = {
  title: 'Título',
  context: 'Contexto',
  objective: 'Objetivo',
  functionalRequirements: [],
  nonFunctionalRequirements: [],
  acceptanceCriteria: ['Critério único'],
  technicalTasks: [],
  risks: [],
  dependencies: [],
  definitionOfDone: [],
};

/** Verifica se a string é um ISO 8601 válido e re-serializável. */
function isValidIso(timestamp: string): boolean {
  const date = new Date(timestamp);
  return !Number.isNaN(date.getTime()) && date.toISOString() === timestamp;
}

describe('buildEvent', () => {
  it('preenche timestamp em ISO 8601 válido para eventos de progresso', () => {
    for (const phase of TASK_GENERATION_PROGRESS_PHASES) {
      const event = buildEvent({ event: phase, runId, message: 'rótulo' });

      expect(event.event).toBe(phase);
      expect(event.runId).toBe(runId);
      expect(event.message).toBe('rótulo');
      expect(isValidIso(event.timestamp)).toBe(true);
    }
  });

  it('cria evento de progresso sem message (opcional)', () => {
    const event = buildEvent({ event: 'started', runId });

    expect(event.event).toBe('started');
    expect(event.message).toBeUndefined();
    expect(isValidIso(event.timestamp)).toBe(true);
  });

  it('cria evento completed com specification e taskId', () => {
    const event = buildEvent({
      event: 'completed',
      runId,
      taskId: 'task-1',
      specification,
    });

    expect(event.event).toBe('completed');
    expect(isValidIso(event.timestamp)).toBe(true);
    // Discriminação: no completed, specification e taskId existem no tipo.
    expect(event.taskId).toBe('task-1');
    expect(event.specification).toEqual(specification);
  });

  it('cria evento failed com error e taskId', () => {
    const event = buildEvent({
      event: 'failed',
      runId,
      taskId: 'task-1',
      error: 'algo deu errado',
    });

    expect(event.event).toBe('failed');
    expect(isValidIso(event.timestamp)).toBe(true);
    // Discriminação: no failed, error e taskId existem no tipo.
    expect(event.taskId).toBe('task-1');
    expect(event.error).toBe('algo deu errado');
  });
});

describe('discriminação da união', () => {
  it('distingue completed de failed pelo campo event', () => {
    const completed = buildEvent({
      event: 'completed',
      runId,
      taskId: 'task-1',
      specification,
    });
    const failed = buildEvent({
      event: 'failed',
      runId,
      taskId: 'task-1',
      error: 'erro',
    });

    const events: TaskGenerationEvent[] = [completed, failed];
    const found = events.find((e) => e.event === 'completed');

    expect(found).toBeDefined();
    if (found?.event === 'completed') {
      expect(found.specification).toBeDefined();
    }
  });
});

describe('isTerminalEvent', () => {
  const terminal: TaskGenerationEventName[] = ['completed', 'failed'];

  it('retorna o valor correto para todos os nomes de evento', () => {
    for (const name of TASK_GENERATION_EVENT_NAMES) {
      const event =
        name === 'completed'
          ? buildEvent({ event: 'completed', runId, taskId: 't', specification })
          : name === 'failed'
            ? buildEvent({ event: 'failed', runId, taskId: 't', error: 'e' })
            : buildEvent({ event: name, runId });

      expect(isTerminalEvent(event)).toBe(terminal.includes(name));
    }
  });
});
