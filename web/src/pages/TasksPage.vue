<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { RouterLink } from 'vue-router';
import { useTasksStore } from '@/stores/tasks.store';
import type { TaskSummary } from '@/services/tasks.service';
import { formatDate } from '@/utils/format-date';
import AppSpinner from '@/components/AppSpinner.vue';
import BaseButton from '@/components/BaseButton.vue';
import BaseCard from '@/components/BaseCard.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import TaskStatusBadge from '@/components/TaskStatusBadge.vue';

// Página é UI: orquestra a store (listagem paginada), sem HTTP direto.
const tasksStore = useTasksStore();
const { items, page, totalPages, isLoading, error, deletingId, deleteError } =
  storeToRefs(tasksStore);

// --- Exclusão ---
// Tarefa marcada para exclusão (abre o diálogo de confirmação).
const taskToDelete = ref<TaskSummary | null>(null);
const isConfirmOpen = computed({
  get: () => taskToDelete.value !== null,
  set: (open: boolean) => {
    if (!open) {
      taskToDelete.value = null;
    }
  },
});

// Está excluindo justamente a tarefa em confirmação.
const isDeleting = computed(
  () => taskToDelete.value !== null && deletingId.value === taskToDelete.value.id,
);

// Abre o diálogo para a tarefa escolhida.
function askDelete(task: TaskSummary): void {
  taskToDelete.value = task;
}

// Confirma a exclusão; fecha o diálogo somente em caso de sucesso.
async function confirmDelete(): Promise<void> {
  if (taskToDelete.value === null) {
    return;
  }
  const ok = await tasksStore.remove(taskToDelete.value.id);
  if (ok) {
    taskToDelete.value = null;
  }
}

// Carrega a primeira página ao montar.
onMounted(() => {
  void tasksStore.fetchList();
});

// Refaz a busca da página atual (usado no "Tentar novamente").
function retry(): void {
  void tasksStore.fetchList();
}

// Navega para a página anterior, respeitando o limite inferior.
function goToPrevious(): void {
  if (page.value > 1) {
    void tasksStore.fetchList(page.value - 1);
  }
}

// Navega para a próxima página, respeitando o limite superior.
function goToNext(): void {
  if (page.value < totalPages.value) {
    void tasksStore.fetchList(page.value + 1);
  }
}
</script>

<template>
  <section class="tasks-page">
    <header class="tasks-page__header">
      <h1 class="tasks-page__title">Minhas tarefas</h1>
      <BaseButton variant="primary" type="button" class="tasks-page__new">
        <RouterLink to="/tasks/new" class="tasks-page__new-link">Nova tarefa</RouterLink>
      </BaseButton>
    </header>

    <!-- Estado: carregando -->
    <div v-if="isLoading" class="tasks-page__state">
      <AppSpinner label="Carregando tarefas" />
      <p>Carregando tarefas</p>
    </div>

    <!-- Estado: erro -->
    <div v-else-if="error" class="tasks-page__state">
      <p role="alert" class="tasks-page__error">{{ error }}</p>
      <BaseButton variant="secondary" type="button" @click="retry">Tentar novamente</BaseButton>
    </div>

    <!-- Estado: vazio (sem erro e sem loading) -->
    <BaseCard v-else-if="items.length === 0" class="tasks-page__empty">
      <p class="tasks-page__empty-text">
        Você ainda não tem tarefas. Que tal criar a primeira especificação?
      </p>
      <BaseButton variant="primary" type="button">
        <RouterLink to="/tasks/new" class="tasks-page__new-link">Criar primeira tarefa</RouterLink>
      </BaseButton>
    </BaseCard>

    <!-- Estado: sucesso -->
    <template v-else>
      <p v-if="deleteError" role="alert" class="tasks-page__error">{{ deleteError }}</p>

      <ul class="tasks-page__list">
        <li v-for="task in items" :key="task.id" class="tasks-page__item">
          <RouterLink :to="`/tasks/${task.id}`" class="tasks-page__item-link">
            <span class="tasks-page__item-description">{{ task.description }}</span>
            <span class="tasks-page__item-meta">
              <TaskStatusBadge :status="task.status" />
              <time :datetime="task.createdAt" class="tasks-page__item-date">
                {{ formatDate(task.createdAt) }}
              </time>
            </span>
          </RouterLink>
          <button
            type="button"
            class="tasks-page__delete"
            :disabled="deletingId === task.id"
            :aria-label="`Excluir tarefa: ${task.description}`"
            @click="askDelete(task)"
          >
            <svg
              class="tasks-page__delete-icon"
              viewBox="0 0 24 24"
              width="20"
              height="20"
              aria-hidden="true"
              focusable="false"
            >
              <path
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7m4 4v6m4-6v6"
              />
            </svg>
          </button>
        </li>
      </ul>

      <ConfirmDialog
        v-model:open="isConfirmOpen"
        title="Excluir tarefa"
        message="Tem certeza que deseja excluir esta tarefa? Esta ação não pode ser desfeita."
        confirm-label="Excluir"
        cancel-label="Cancelar"
        :loading="isDeleting"
        @confirm="confirmDelete"
      />

      <nav v-if="totalPages > 1" class="tasks-page__pagination" aria-label="Paginação">
        <BaseButton variant="secondary" type="button" :disabled="page <= 1" @click="goToPrevious">
          Anterior
        </BaseButton>
        <span class="tasks-page__page-indicator" aria-live="polite">
          Página {{ page }} de {{ totalPages }}
        </span>
        <BaseButton
          variant="secondary"
          type="button"
          :disabled="page >= totalPages"
          @click="goToNext"
        >
          Próxima
        </BaseButton>
      </nav>
    </template>
  </section>
</template>

<style scoped>
.tasks-page {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-24);
  max-width: 720px;
  margin: 0 auto;
}

.tasks-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-16);
  flex-wrap: wrap;
}

.tasks-page__title {
  font-family: var(--font-feather);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-heading-sm);
  color: var(--color-eager-green);
}

/* O RouterLink dentro do botão herda a cor/tipografia do botão (CTA verde). */
.tasks-page__new-link {
  color: inherit;
  text-decoration: none;
}

.tasks-page__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-16);
  padding: var(--spacing-32);
  color: var(--color-charcoal);
}

.tasks-page__error {
  font-weight: var(--font-weight-bold);
  color: var(--color-night-ink);
}

.tasks-page__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-16);
  text-align: center;
}

.tasks-page__empty-text {
  color: var(--color-charcoal);
}

.tasks-page__list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-12);
  list-style: none;
}

.tasks-page__item {
  display: flex;
  align-items: stretch;
  gap: var(--spacing-8);
}

.tasks-page__item-link {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: var(--spacing-8);
  padding: var(--spacing-16);
  border: 2px solid var(--color-faded-gray);
  border-radius: var(--radius-xl);
  background-color: var(--color-paper-white);
  text-decoration: none;
}

.tasks-page__item-link:hover {
  border-color: var(--color-spark-blue);
}

/* Botão de lixeira: outline neutro que fica vermelho no hover/foco. */
.tasks-page__delete {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 44px;
  padding: 0;
  border: 2px solid var(--color-faded-gray);
  border-radius: var(--radius-xl);
  background-color: var(--color-paper-white);
  color: var(--color-pencil-gray);
  cursor: pointer;
  transition:
    color 0.15s ease,
    border-color 0.15s ease;
}

.tasks-page__delete:hover:not(:disabled),
.tasks-page__delete:focus-visible:not(:disabled) {
  color: var(--color-night-ink);
  border-color: var(--color-night-ink);
}

.tasks-page__delete:focus-visible {
  outline: 2px solid var(--color-spark-blue);
  outline-offset: 2px;
}

.tasks-page__delete:disabled {
  cursor: not-allowed;
  color: var(--color-faded-gray);
}

.tasks-page__delete-icon {
  display: block;
}

.tasks-page__item-description {
  color: var(--color-charcoal);
  font-weight: var(--font-weight-bold);
  /* Trunca em até 2 linhas para não estourar o layout. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tasks-page__item-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-12);
  flex-wrap: wrap;
}

.tasks-page__item-date {
  font-size: var(--text-caption);
  color: var(--color-pencil-gray);
}

.tasks-page__pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-16);
}

.tasks-page__page-indicator {
  font-size: var(--text-caption);
  color: var(--color-charcoal);
}
</style>
