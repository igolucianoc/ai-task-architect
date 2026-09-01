import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ApiError } from '@/services/http-client';
import * as tasksService from '@/services/tasks.service';
import type { PaginatedTasks, TaskDetail } from '@/services/tasks.service';
import { useTasksStore } from './tasks.store';

// Mocka o service de tarefas (não a rede).
vi.mock('@/services/tasks.service');

const PAGE: PaginatedTasks = {
  items: [
    {
      id: 't1',
      description: 'Primeira',
      status: 'PENDING',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
  ],
  page: 2,
  pageSize: 10,
  total: 25,
};

const DETAIL: TaskDetail = {
  id: 't1',
  description: 'Primeira',
  status: 'PENDING',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  specification: null,
  lastRun: null,
  evaluation: null,
};

describe('tasks.store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('fetchList popula items/total/page/pageSize e desliga o loading', async () => {
    vi.mocked(tasksService.listTasks).mockResolvedValue(PAGE);
    const store = useTasksStore();

    await store.fetchList(2, 10);

    expect(store.items).toEqual(PAGE.items);
    expect(store.page).toBe(2);
    expect(store.pageSize).toBe(10);
    expect(store.total).toBe(25);
    expect(store.totalPages).toBe(3);
    expect(store.isLoading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('fetchList em erro seta error e não quebra o loading', async () => {
    vi.mocked(tasksService.listTasks).mockRejectedValue(
      new ApiError(500, 'Falha no servidor', null),
    );
    const store = useTasksStore();

    await store.fetchList();

    expect(store.error).toBe('Falha no servidor');
    expect(store.items).toEqual([]);
    expect(store.isLoading).toBe(false);
  });

  it('fetchDetail popula current', async () => {
    vi.mocked(tasksService.getTask).mockResolvedValue(DETAIL);
    const store = useTasksStore();

    await store.fetchDetail('t1');

    expect(store.current).toEqual(DETAIL);
    expect(store.isLoadingDetail).toBe(false);
    expect(store.detailError).toBeNull();
  });

  it('fetchDetail em erro seta detailError', async () => {
    vi.mocked(tasksService.getTask).mockRejectedValue(new ApiError(404, 'Não encontrada', null));
    const store = useTasksStore();

    await store.fetchDetail('missing');

    expect(store.current).toBeNull();
    expect(store.detailError).toBe('Não encontrada');
    expect(store.isLoadingDetail).toBe(false);
  });

  it('create retorna o taskId em sucesso', async () => {
    vi.mocked(tasksService.createTask).mockResolvedValue({ taskId: 'new-1', status: 'PENDING' });
    const store = useTasksStore();

    const id = await store.create('Nova tarefa');

    expect(id).toBe('new-1');
    expect(store.error).toBeNull();
    expect(store.isLoading).toBe(false);
  });

  it('create retorna null e seta error em falha', async () => {
    vi.mocked(tasksService.createTask).mockRejectedValue(
      new ApiError(400, 'Descrição inválida', null),
    );
    const store = useTasksStore();

    const id = await store.create('');

    expect(id).toBeNull();
    expect(store.error).toBe('Descrição inválida');
    expect(store.isLoading).toBe(false);
  });
});
