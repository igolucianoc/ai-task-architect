// Funções de acesso a dados para tarefas (`/api/tasks`), via http client injetado.
// Reutiliza `TaskSpecification` do contrato de eventos SSE (task-events.ts).

import type { HttpClient } from './http-client';
import type { TaskSpecification } from './task-events';

/** Resumo de tarefa retornado em listagens e embutido no detalhe. */
export interface TaskSummary {
  id: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** Visão de avaliação de uma tarefa. */
export interface TaskEvaluationView {
  status: string;
  result: string | null;
  overallScore: number | null;
  rationale: string | null;
  criteria: Record<string, number> | null;
  reasons: string[];
  model: string | null;
  promptVersion: string | null;
  evaluatedAt: string | null;
}

/** Dados da última execução (run) de geração de uma tarefa. */
export interface TaskLastRun {
  status: string;
  model: string;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
}

/** Detalhe completo de uma tarefa. */
export type TaskDetail = TaskSummary & {
  specification: TaskSpecification | null;
  lastRun: TaskLastRun | null;
  evaluation: TaskEvaluationView | null;
};

/** Página de tarefas retornada por `GET /api/tasks`. */
export interface PaginatedTasks {
  items: TaskSummary[];
  page: number;
  pageSize: number;
  total: number;
}

/** Resposta de criação de tarefa. */
export interface CreatedTask {
  taskId: string;
  status: string;
}

/** Cria uma nova tarefa a partir de uma descrição. */
export function createTask(client: HttpClient, description: string): Promise<CreatedTask> {
  return client.post<CreatedTask>('/api/tasks', { description });
}

/** Lista tarefas paginadas. */
export function listTasks(
  client: HttpClient,
  page: number,
  pageSize: number,
): Promise<PaginatedTasks> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return client.get<PaginatedTasks>(`/api/tasks?${query.toString()}`);
}

/** Busca o detalhe de uma tarefa por id. */
export function getTask(client: HttpClient, id: string): Promise<TaskDetail> {
  return client.get<TaskDetail>(`/api/tasks/${encodeURIComponent(id)}`);
}

/** Exclui uma tarefa por id. Backend responde 204 sem corpo. */
export function deleteTask(client: HttpClient, id: string): Promise<void> {
  return client.request<void>(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
