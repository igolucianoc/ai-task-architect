import { describe, it, expect, vi } from 'vitest';
import type { HttpClient } from './http-client';
import {
  createTask,
  listTasks,
  getTask,
  type CreatedTask,
  type PaginatedTasks,
  type TaskDetail,
} from './tasks.service';

/** Cria um http client mockado com get/post/request spies. */
function makeClient(): HttpClient & {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn(),
    post: vi.fn(),
    request: vi.fn(),
  };
}

describe('tasks.service', () => {
  it('createTask deve chamar POST /api/tasks com { description }', async () => {
    const client = makeClient();
    const created: CreatedTask = { taskId: 't1', status: 'queued' };
    client.post.mockResolvedValue(created);

    const result = await createTask(client, 'minha descrição');

    expect(client.post).toHaveBeenCalledWith('/api/tasks', { description: 'minha descrição' });
    expect(result).toEqual(created);
  });

  it('listTasks deve chamar GET /api/tasks com page e pageSize na query', async () => {
    const client = makeClient();
    const page: PaginatedTasks = { items: [], page: 2, pageSize: 10, total: 0 };
    client.get.mockResolvedValue(page);

    const result = await listTasks(client, 2, 10);

    expect(client.get).toHaveBeenCalledWith('/api/tasks?page=2&pageSize=10');
    expect(result).toEqual(page);
  });

  it('getTask deve chamar GET /api/tasks/:id e retornar o detalhe', async () => {
    const client = makeClient();
    const detail: TaskDetail = {
      id: 't1',
      description: 'desc',
      status: 'completed',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
      specification: null,
      lastRun: null,
      evaluation: null,
      llmTotals: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 },
    };
    client.get.mockResolvedValue(detail);

    const result = await getTask(client, 't1');

    expect(client.get).toHaveBeenCalledWith('/api/tasks/t1');
    expect(result).toEqual(detail);
  });

  it('getTask deve codificar o id na URL', async () => {
    const client = makeClient();
    client.get.mockResolvedValue({} as TaskDetail);

    await getTask(client, 'a/b c');

    expect(client.get).toHaveBeenCalledWith('/api/tasks/a%2Fb%20c');
  });
});
