<script setup lang="ts">
// Página de detalhe da tarefa (Fatias 6+7). Orquestra três coisas:
//  1) carrega o detalhe atual via store (fetchDetail);
//  2) acompanha/dispara a geração em tempo real via SSE (composable de stream);
//  3) após o stream concluir, faz polling leve do detalhe até a avaliação
//     (LLM Judge, assíncrona) ficar pronta.
//
// Decisões:
//  - SEMPRE iniciamos o stream após o fetchDetail inicial. O composable reemite
//    o estado terminal (completed/failed) para tarefas já persistidas, então há
//    um único caminho de renderização — mais simples e correto.
//  - A avaliação não vem por SSE: é buscada por fetchDetail e pode ainda não
//    existir. Fazemos polling (2s, até 10 tentativas) parando em COMPLETED/
//    UNAVAILABLE. O timer é sempre limpo no onUnmounted.

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useTasksStore } from '@/stores/tasks.store';
import { useAuthStore } from '@/stores/auth.store';
import { useTaskGenerationStream } from '@/composables/useTaskGenerationStream';
import type { LlmTotalsView } from '@/services/tasks.service';
import { formatDate } from '@/utils/format-date';
import AppSpinner from '@/components/AppSpinner.vue';
import BaseButton from '@/components/BaseButton.vue';
import BaseCard from '@/components/BaseCard.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import TaskStatusBadge from '@/components/TaskStatusBadge.vue';
import GenerationProgress from '@/components/GenerationProgress.vue';
import SpecificationView from '@/components/SpecificationView.vue';
import EvaluationPanel from '@/components/EvaluationPanel.vue';
import LlmMetricsPanel from '@/components/LlmMetricsPanel.vue';

// Parâmetros de polling da avaliação.
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 10;

const route = useRoute();
const router = useRouter();
const tasksStore = useTasksStore();
const authStore = useAuthStore();
const stream = useTaskGenerationStream();

const { current, isLoadingDetail, detailError, deletingId, deleteError } = storeToRefs(tasksStore);
// O composable já retorna refs (readonly): desestruturamos direto, com apelidos.
const {
  events,
  status: streamStatus,
  specification: streamSpecification,
  error: streamError,
} = stream;

// Id da rota (string). Pode ser array em rotas com params repetidos; normalizamos.
const taskId = computed(() => {
  const raw = route.params.id;
  return Array.isArray(raw) ? (raw[0] ?? '') : raw;
});

// --- Exclusão ---
// Controla a abertura do diálogo de confirmação de exclusão.
const isConfirmOpen = ref(false);
// Está excluindo a tarefa atual.
const isDeleting = computed(() => deletingId.value === taskId.value);

function askDelete(): void {
  isConfirmOpen.value = true;
}

// Confirma a exclusão; ao concluir, volta para a listagem. Em erro, mantém a
// página e exibe a mensagem (deleteError).
async function confirmDelete(): Promise<void> {
  const ok = await tasksStore.remove(taskId.value);
  if (ok) {
    isConfirmOpen.value = false;
    void router.push('/tasks');
  }
}

// --- Estado local do polling de avaliação ---
let pollTimer: ReturnType<typeof setTimeout> | null = null;
const pollAttempts = ref(0);
// Indica que estamos aguardando a avaliação ficar pronta.
const isAwaitingEvaluation = ref(false);
// Indica que esgotamos as tentativas sem avaliação pronta.
const evaluationTimedOut = ref(false);

// Especificação a exibir: a do stream (fonte primária ao vivo) ou a persistida.
const specification = computed(
  () => streamSpecification.value ?? current.value?.specification ?? null,
);

// Avaliação atual (do detalhe carregado).
const evaluation = computed(() => current.value?.evaluation ?? null);

// --- Métricas de uso de LLM (observabilidade discreta) ---
// Totais zerados usados como fallback: a prop `totals` do painel é obrigatória.
const EMPTY_LLM_TOTALS: LlmTotalsView = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  estimatedCost: 0,
};

const generationUsage = computed(() => current.value?.lastRun?.usage ?? null);
const evaluationUsage = computed(() => current.value?.evaluation?.usage ?? null);
const llmTotals = computed(() => current.value?.llmTotals ?? EMPTY_LLM_TOTALS);
const evaluationModel = computed(() => current.value?.evaluation?.model ?? null);
const evaluationPromptVersion = computed(() => current.value?.evaluation?.promptVersion ?? null);

// A avaliação está pronta quando existe e o status é terminal (não PENDING).
const isEvaluationReady = computed(() => {
  const view = evaluation.value;
  return view !== null && (view.status === 'COMPLETED' || view.status === 'UNAVAILABLE');
});

// Erro combinado: falha do stream ou mensagem da última execução persistida.
const failureMessage = computed(
  () => streamError.value ?? current.value?.lastRun?.errorMessage ?? null,
);

// Estados de exibição do corpo principal.
const isStreaming = computed(
  () => streamStatus.value === 'connecting' || streamStatus.value === 'streaming',
);
const hasFailed = computed(() => streamStatus.value === 'failed' || streamStatus.value === 'error');
const hasCompleted = computed(() => streamStatus.value === 'completed');

// --- Polling da avaliação ---

/** Limpa o timer de polling, se houver. Idempotente. */
function clearPollTimer(): void {
  if (pollTimer !== null) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

/**
 * Um ciclo de polling: rebusca o detalhe e decide se continua. Para quando a
 * avaliação fica pronta ou ao atingir o limite de tentativas.
 */
async function pollEvaluationOnce(): Promise<void> {
  await tasksStore.fetchDetail(taskId.value);

  if (isEvaluationReady.value) {
    isAwaitingEvaluation.value = false;
    return;
  }

  pollAttempts.value += 1;
  if (pollAttempts.value >= POLL_MAX_ATTEMPTS) {
    isAwaitingEvaluation.value = false;
    evaluationTimedOut.value = true;
    return;
  }

  pollTimer = setTimeout(() => {
    void pollEvaluationOnce();
  }, POLL_INTERVAL_MS);
}

/** Inicia o acompanhamento da avaliação após o stream concluir. */
function startEvaluationPolling(): void {
  clearPollTimer();
  pollAttempts.value = 0;
  evaluationTimedOut.value = false;
  isAwaitingEvaluation.value = true;
  void pollEvaluationOnce();
}

/** Reprocessa manualmente a busca do detalhe (botão "Atualizar"). */
function refreshDetail(): void {
  evaluationTimedOut.value = false;
  startEvaluationPolling();
}

// --- Ciclo de vida ---

onMounted(async () => {
  const id = taskId.value;
  if (id === '') {
    return;
  }

  // Carrega o estado atual (também cobre 404 → detailError).
  await tasksStore.fetchDetail(id);

  // Sem token numa rota protegida não deveria ocorrer; seja defensivo.
  const token = authStore.accessToken;
  if (token === null) {
    return;
  }

  // Sempre inicia o stream: reemite o terminal para tarefas já concluídas/falhas.
  stream.start(id, token);
});

onUnmounted(() => {
  stream.stop();
  clearPollTimer();
});

// Dispara o polling da avaliação assim que o stream conclui a geração.
watch(hasCompleted, (completed) => {
  if (completed) {
    startEvaluationPolling();
  }
});
</script>

<template>
  <section class="task-detail-page">
    <!-- Cabeçalho: título curto + status + descrição + data. -->
    <header class="task-detail-page__header">
      <div class="task-detail-page__title-row">
        <h1 class="task-detail-page__title">Tarefa</h1>
        <TaskStatusBadge v-if="current" :status="current.status" />
        <button
          v-if="current"
          type="button"
          class="task-detail-page__delete"
          :disabled="isDeleting"
          aria-label="Excluir tarefa"
          @click="askDelete"
        >
          <svg
            class="task-detail-page__delete-icon"
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
      </div>
      <p v-if="current" class="task-detail-page__description">{{ current.description }}</p>
      <time v-if="current" :datetime="current.createdAt" class="task-detail-page__date">
        {{ formatDate(current.createdAt) }}
      </time>
      <p v-if="deleteError" role="alert" class="task-detail-page__error">{{ deleteError }}</p>
    </header>

    <ConfirmDialog
      v-model:open="isConfirmOpen"
      title="Excluir tarefa"
      message="Tem certeza que deseja excluir esta tarefa? Esta ação não pode ser desfeita."
      confirm-label="Excluir"
      cancel-label="Cancelar"
      :loading="isDeleting"
      @confirm="confirmDelete"
    />

    <!-- Sem token: rota protegida, mas defensivo. -->
    <p v-if="authStore.accessToken === null" role="alert" class="task-detail-page__error">
      Sessão expirada. Entre novamente para acompanhar esta tarefa.
    </p>

    <!-- Erro no carregamento inicial do detalhe (ex.: 404). -->
    <div v-else-if="detailError && !current" class="task-detail-page__state">
      <p role="alert" class="task-detail-page__error">{{ detailError }}</p>
      <BaseButton variant="secondary" type="button">
        <RouterLink to="/tasks" class="task-detail-page__link">Voltar às tarefas</RouterLink>
      </BaseButton>
    </div>

    <!-- Carregando o detalhe inicial (antes de qualquer estado do stream). -->
    <div v-else-if="isLoadingDetail && streamStatus === 'idle'" class="task-detail-page__state">
      <AppSpinner label="Carregando tarefa" />
      <p>Carregando tarefa</p>
    </div>

    <!-- Falha na geração (stream failed/error ou run persistida com erro). -->
    <div v-else-if="hasFailed" class="task-detail-page__state">
      <p role="alert" class="task-detail-page__error">
        {{ failureMessage ?? 'Não foi possível gerar a especificação.' }}
      </p>
      <BaseButton variant="secondary" type="button">
        <RouterLink to="/tasks" class="task-detail-page__link">Voltar às tarefas</RouterLink>
      </BaseButton>
    </div>

    <!-- Geração em andamento: linha do tempo de progresso. -->
    <BaseCard v-else-if="isStreaming" class="task-detail-page__block">
      <GenerationProgress :events="events" :status="streamStatus" />
    </BaseCard>

    <!-- Geração concluída: especificação + bloco de avaliação. -->
    <template v-else-if="hasCompleted && specification">
      <BaseCard class="task-detail-page__block">
        <SpecificationView :specification="specification" />
      </BaseCard>

      <BaseCard class="task-detail-page__block">
        <!-- Avaliação pronta. -->
        <EvaluationPanel v-if="isEvaluationReady && evaluation" :evaluation="evaluation" />

        <!-- Aguardando o worker de avaliação. -->
        <div v-else-if="isAwaitingEvaluation" class="task-detail-page__state">
          <AppSpinner label="Avaliando qualidade" />
          <p>Avaliando qualidade...</p>
        </div>

        <!-- Estourou o limite sem avaliação pronta: permite atualizar. -->
        <div v-else-if="evaluationTimedOut" class="task-detail-page__state">
          <p role="status">A avaliação ainda está sendo processada.</p>
          <BaseButton variant="secondary" type="button" @click="refreshDetail">
            Atualizar
          </BaseButton>
        </div>
      </BaseCard>

      <!-- Rodapé discreto de métricas de uso de LLM (geração + avaliação). -->
      <BaseCard class="task-detail-page__block">
        <LlmMetricsPanel
          :generation-usage="generationUsage"
          :evaluation-usage="evaluationUsage"
          :totals="llmTotals"
          :evaluation-model="evaluationModel"
          :evaluation-prompt-version="evaluationPromptVersion"
        />
      </BaseCard>
    </template>
  </section>
</template>

<style scoped>
.task-detail-page {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-24);
  max-width: 720px;
  margin: 0 auto;
}

.task-detail-page__header {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-8);
}

.task-detail-page__title-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-12);
  flex-wrap: wrap;
}

/* Empurra o botão de exclusão para a direita da linha do título. */
.task-detail-page__delete {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  width: 44px;
  height: 44px;
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

.task-detail-page__delete:hover:not(:disabled),
.task-detail-page__delete:focus-visible:not(:disabled) {
  color: var(--color-night-ink);
  border-color: var(--color-night-ink);
}

.task-detail-page__delete:focus-visible {
  outline: 2px solid var(--color-spark-blue);
  outline-offset: 2px;
}

.task-detail-page__delete:disabled {
  cursor: not-allowed;
  color: var(--color-faded-gray);
}

.task-detail-page__delete-icon {
  display: block;
}

.task-detail-page__title {
  font-family: var(--font-feather);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-heading-sm);
  color: var(--color-eager-green);
}

.task-detail-page__description {
  color: var(--color-charcoal);
  font-weight: var(--font-weight-bold);
}

.task-detail-page__date {
  font-size: var(--text-caption);
  color: var(--color-pencil-gray);
}

.task-detail-page__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-16);
  padding: var(--spacing-24);
  color: var(--color-charcoal);
}

.task-detail-page__error {
  font-weight: var(--font-weight-bold);
  color: var(--color-night-ink);
}

.task-detail-page__link {
  color: inherit;
  text-decoration: none;
}
</style>
