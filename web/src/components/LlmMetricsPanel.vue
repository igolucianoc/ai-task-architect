<script setup lang="ts">
import { computed } from 'vue';
import type { LlmUsageView, EvaluationUsageView, LlmTotalsView } from '@/services/tasks.service';
import { formatInteger, formatCost } from '@/utils/format-number';

// Componente de UI: exibe, de forma discreta, as métricas de uso de LLM da
// tarefa (geração + avaliação + total). Recebe tudo via props; não acessa
// store nem HTTP.
const props = defineProps<{
  // Uso da geração (vem de `lastRun.usage`). Null quando não houve run.
  generationUsage: LlmUsageView | null;
  // Uso da avaliação (vem de `evaluation.usage`). Null quando não avaliada.
  evaluationUsage: EvaluationUsageView | null;
  // Agregado de toda a tarefa. Sempre presente (zeros quando não há uso).
  totals: LlmTotalsView;
  // Modelo/versão do prompt da avaliação (exibidos na linha da avaliação).
  evaluationModel?: string | null;
  evaluationPromptVersion?: string | null;
}>();

// Estado vazio: nenhum uso registrado em geração nem avaliação e total zerado.
const isEmpty = computed(
  () =>
    props.generationUsage === null &&
    props.evaluationUsage === null &&
    props.totals.totalTokens === 0,
);
</script>

<template>
  <section class="llm-metrics-panel" aria-label="Métricas de uso de modelo">
    <h3 class="llm-metrics-panel__subheading">Uso de modelo</h3>

    <!-- Estado vazio: linha calma, sem quebrar o layout. -->
    <p v-if="isEmpty" role="status" class="llm-metrics-panel__empty">
      Sem métricas de uso disponíveis.
    </p>

    <template v-else>
      <!-- Bloco de GERAÇÃO. -->
      <div v-if="generationUsage" class="llm-metrics-panel__group">
        <h4 class="llm-metrics-panel__group-title">Geração</h4>
        <dl class="llm-metrics-panel__list">
          <div class="llm-metrics-panel__item">
            <dt class="llm-metrics-panel__label">Modelo</dt>
            <dd class="llm-metrics-panel__value">{{ generationUsage.model }}</dd>
          </div>
          <div class="llm-metrics-panel__item">
            <dt class="llm-metrics-panel__label">Tokens de prompt</dt>
            <dd class="llm-metrics-panel__value">
              {{ formatInteger(generationUsage.promptTokens) }}
            </dd>
          </div>
          <div class="llm-metrics-panel__item">
            <dt class="llm-metrics-panel__label">Tokens de conclusão</dt>
            <dd class="llm-metrics-panel__value">
              {{ formatInteger(generationUsage.completionTokens) }}
            </dd>
          </div>
          <div class="llm-metrics-panel__item">
            <dt class="llm-metrics-panel__label">Total de tokens</dt>
            <dd class="llm-metrics-panel__value">
              {{ formatInteger(generationUsage.totalTokens) }}
            </dd>
          </div>
          <div class="llm-metrics-panel__item">
            <dt class="llm-metrics-panel__label">Latência</dt>
            <dd class="llm-metrics-panel__value">
              {{ formatInteger(generationUsage.latencyMs) }} ms
            </dd>
          </div>
          <div class="llm-metrics-panel__item">
            <dt class="llm-metrics-panel__label">Custo estimado</dt>
            <dd class="llm-metrics-panel__value">
              {{ formatCost(generationUsage.estimatedCost) }}
            </dd>
          </div>
        </dl>
      </div>

      <!-- Bloco de AVALIAÇÃO. -->
      <div v-if="evaluationUsage" class="llm-metrics-panel__group">
        <h4 class="llm-metrics-panel__group-title">Avaliação</h4>
        <dl class="llm-metrics-panel__list">
          <div v-if="evaluationModel" class="llm-metrics-panel__item">
            <dt class="llm-metrics-panel__label">Modelo</dt>
            <dd class="llm-metrics-panel__value">{{ evaluationModel }}</dd>
          </div>
          <div v-if="evaluationPromptVersion" class="llm-metrics-panel__item">
            <dt class="llm-metrics-panel__label">Versão do prompt</dt>
            <dd class="llm-metrics-panel__value">{{ evaluationPromptVersion }}</dd>
          </div>
          <div class="llm-metrics-panel__item">
            <dt class="llm-metrics-panel__label">Tokens de prompt</dt>
            <dd class="llm-metrics-panel__value">
              {{ formatInteger(evaluationUsage.promptTokens) }}
            </dd>
          </div>
          <div class="llm-metrics-panel__item">
            <dt class="llm-metrics-panel__label">Tokens de conclusão</dt>
            <dd class="llm-metrics-panel__value">
              {{ formatInteger(evaluationUsage.completionTokens) }}
            </dd>
          </div>
          <div class="llm-metrics-panel__item">
            <dt class="llm-metrics-panel__label">Total de tokens</dt>
            <dd class="llm-metrics-panel__value">
              {{ formatInteger(evaluationUsage.totalTokens) }}
            </dd>
          </div>
          <div class="llm-metrics-panel__item">
            <dt class="llm-metrics-panel__label">Latência</dt>
            <dd class="llm-metrics-panel__value">
              {{ formatInteger(evaluationUsage.latencyMs) }} ms
            </dd>
          </div>
          <div class="llm-metrics-panel__item">
            <dt class="llm-metrics-panel__label">Custo estimado</dt>
            <dd class="llm-metrics-panel__value">
              {{ formatCost(evaluationUsage.estimatedCost) }}
            </dd>
          </div>
        </dl>
      </div>

      <!-- Bloco de TOTAL (sempre exibido fora do estado vazio). -->
      <div class="llm-metrics-panel__group">
        <h4 class="llm-metrics-panel__group-title">Total</h4>
        <dl class="llm-metrics-panel__list">
          <div class="llm-metrics-panel__item">
            <dt class="llm-metrics-panel__label">Total de tokens</dt>
            <dd class="llm-metrics-panel__value">{{ formatInteger(totals.totalTokens) }}</dd>
          </div>
          <div class="llm-metrics-panel__item">
            <dt class="llm-metrics-panel__label">Custo estimado</dt>
            <dd class="llm-metrics-panel__value">{{ formatCost(totals.estimatedCost) }}</dd>
          </div>
        </dl>
      </div>
    </template>
  </section>
</template>

<style scoped>
.llm-metrics-panel {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-16);
}

.llm-metrics-panel__subheading {
  font-family: var(--font-feather);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-body);
  color: var(--color-charcoal);
}

.llm-metrics-panel__empty {
  font-size: var(--text-caption);
  color: var(--color-pencil-gray);
}

.llm-metrics-panel__group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-8);
}

.llm-metrics-panel__group-title {
  font-size: var(--text-caption);
  font-weight: var(--font-weight-bold);
  color: var(--color-pencil-gray);
  text-transform: uppercase;
  letter-spacing: 0.053em;
}

.llm-metrics-panel__list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-8);
}

.llm-metrics-panel__item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--spacing-12);
}

.llm-metrics-panel__label {
  font-size: var(--text-caption);
  color: var(--color-pencil-gray);
}

.llm-metrics-panel__value {
  color: var(--color-night-ink);
  font-weight: var(--font-weight-bold);
}
</style>
