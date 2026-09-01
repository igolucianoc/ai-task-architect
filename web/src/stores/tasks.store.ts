// Store de tarefas (setup store). Gerencia dois recortes independentes:
// a listagem paginada e o detalhe da tarefa atualmente aberta.
// Consome o http client singleton via os services de tarefas.

import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { ApiError } from '@/services/http-client';
import { httpClient } from '@/services/http-client-instance';
import { createTask, getTask, listTasks } from '@/services/tasks.service';
import type { TaskDetail, TaskSummary } from '@/services/tasks.service';

/** Tamanho de página padrão da listagem. */
const DEFAULT_PAGE_SIZE = 20;

/** Extrai uma mensagem legível de um erro desconhecido. */
function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Ocorreu um erro inesperado.';
}

export const useTasksStore = defineStore('tasks', () => {
  // --- Estado: listagem ---
  const items = ref<TaskSummary[]>([]);
  const page = ref<number>(1);
  const pageSize = ref<number>(DEFAULT_PAGE_SIZE);
  const total = ref<number>(0);
  const isLoading = ref<boolean>(false);
  const error = ref<string | null>(null);

  // --- Estado: detalhe ---
  const current = ref<TaskDetail | null>(null);
  const isLoadingDetail = ref<boolean>(false);
  const detailError = ref<string | null>(null);

  // --- Getters ---
  const totalPages = computed(() =>
    pageSize.value > 0 ? Math.ceil(total.value / pageSize.value) : 0,
  );

  // --- Actions ---

  /** Busca uma página de tarefas e popula a listagem. Trata loading/erro. */
  async function fetchList(nextPage?: number, nextPageSize?: number): Promise<void> {
    const targetPage = nextPage ?? page.value;
    const targetPageSize = nextPageSize ?? pageSize.value;
    isLoading.value = true;
    error.value = null;
    try {
      const result = await listTasks(httpClient, targetPage, targetPageSize);
      items.value = result.items;
      page.value = result.page;
      pageSize.value = result.pageSize;
      total.value = result.total;
    } catch (err) {
      error.value = toErrorMessage(err);
    } finally {
      isLoading.value = false;
    }
  }

  /** Busca o detalhe de uma tarefa por id e popula `current`. */
  async function fetchDetail(id: string): Promise<void> {
    isLoadingDetail.value = true;
    detailError.value = null;
    try {
      current.value = await getTask(httpClient, id);
    } catch (err) {
      detailError.value = toErrorMessage(err);
    } finally {
      isLoadingDetail.value = false;
    }
  }

  /**
   * Cria uma tarefa a partir da descrição. Retorna o `taskId` criado para o
   * componente decidir a navegação, ou `null` em caso de erro.
   */
  async function create(description: string): Promise<string | null> {
    isLoading.value = true;
    error.value = null;
    try {
      const result = await createTask(httpClient, description);
      return result.taskId;
    } catch (err) {
      error.value = toErrorMessage(err);
      return null;
    } finally {
      isLoading.value = false;
    }
  }

  return {
    // estado: listagem
    items,
    page,
    pageSize,
    total,
    isLoading,
    error,
    // estado: detalhe
    current,
    isLoadingDetail,
    detailError,
    // getters
    totalPages,
    // actions
    fetchList,
    fetchDetail,
    create,
  };
});
