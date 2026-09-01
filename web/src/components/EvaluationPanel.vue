<script setup lang="ts">
import { computed } from 'vue';
import type { TaskEvaluationView } from '@/services/tasks.service';
import { formatDate } from '@/utils/format-date';

// Componente de UI: renderiza o Quality Gate (avaliação do LLM Judge).
// Recebe a evaluation como prop; não acessa store nem HTTP.
const props = defineProps<{
  evaluation: TaskEvaluationView;
}>();

// Rótulos pt-BR dos critérios de avaliação conhecidos.
const CRITERIA_LABELS: Record<string, string> = {
  clarity: 'Clareza',
  completeness: 'Completude',
  consistency: 'Consistência',
  testability: 'Testabilidade',
  risks: 'Riscos',
  requirementsAdherence: 'Aderência aos requisitos',
};

const isCompleted = computed(() => props.evaluation.status === 'COMPLETED');
const isUnavailable = computed(() => props.evaluation.status === 'UNAVAILABLE');
const isApproved = computed(() => props.evaluation.result === 'APPROVED');

// Selo textual em pt-BR conforme o resultado.
const resultLabel = computed(() => (isApproved.value ? 'APROVADO' : 'REPROVADO'));

// Lista de critérios com rótulo pt-BR e nota, derivada do Record.
const criteriaList = computed(() => {
  const criteria = props.evaluation.criteria;
  if (criteria === null) {
    return [];
  }
  return Object.entries(criteria).map(([key, score]) => ({
    key,
    label: CRITERIA_LABELS[key] ?? key,
    score,
  }));
});

// Motivos de reprovação (exibidos apenas quando REPROVADO).
const showReasons = computed(
  () => isCompleted.value && !isApproved.value && props.evaluation.reasons.length > 0,
);
</script>

<template>
  <section class="evaluation-panel" aria-label="Avaliação de qualidade">
    <!-- Avaliação concluída: selo + score + critérios + justificativa. -->
    <template v-if="isCompleted">
      <div
        :class="[
          'evaluation-panel__seal',
          isApproved ? 'evaluation-panel__seal--approved' : 'evaluation-panel__seal--rejected',
        ]"
        role="status"
      >
        {{ resultLabel }}
      </div>

      <p v-if="evaluation.overallScore !== null" class="evaluation-panel__score">
        Nota geral: <strong>{{ evaluation.overallScore }}/10</strong>
      </p>

      <div v-if="criteriaList.length > 0" class="evaluation-panel__criteria">
        <h3 class="evaluation-panel__subheading">Critérios</h3>
        <ul class="evaluation-panel__criteria-list">
          <li
            v-for="criterion in criteriaList"
            :key="criterion.key"
            class="evaluation-panel__criterion"
          >
            <span class="evaluation-panel__criterion-label">{{ criterion.label }}</span>
            <span class="evaluation-panel__criterion-score">{{ criterion.score }}/10</span>
          </li>
        </ul>
      </div>

      <div v-if="evaluation.rationale" class="evaluation-panel__rationale">
        <h3 class="evaluation-panel__subheading">Justificativa</h3>
        <p class="evaluation-panel__text">{{ evaluation.rationale }}</p>
      </div>

      <div v-if="showReasons" class="evaluation-panel__reasons">
        <h3 class="evaluation-panel__subheading">Motivos da reprovação</h3>
        <ul class="evaluation-panel__reasons-list">
          <li v-for="(reason, index) in evaluation.reasons" :key="index">{{ reason }}</li>
        </ul>
      </div>

      <footer class="evaluation-panel__footer">
        <span v-if="evaluation.model">Modelo: {{ evaluation.model }}</span>
        <span v-if="evaluation.promptVersion">Prompt: {{ evaluation.promptVersion }}</span>
        <span v-if="evaluation.evaluatedAt">
          Avaliado em {{ formatDate(evaluation.evaluatedAt) }}
        </span>
      </footer>
    </template>

    <!-- Avaliação indisponível: mensagem calma + motivo, sem selo. -->
    <div v-else-if="isUnavailable" class="evaluation-panel__unavailable">
      <p class="evaluation-panel__unavailable-title">Avaliação indisponível</p>
      <p v-if="evaluation.rationale" class="evaluation-panel__text">{{ evaluation.rationale }}</p>
    </div>
  </section>
</template>

<style scoped>
.evaluation-panel {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-16);
}

.evaluation-panel__seal {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
  font-family: var(--font-feather);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-subheading);
  letter-spacing: 0.053em;
  padding: var(--spacing-8) var(--spacing-24);
  border-radius: var(--radius-xl);
  border: 2px solid var(--color-faded-gray);
  background-color: var(--color-paper-white);
}

/* APROVADO — único caso com verde. */
.evaluation-panel__seal--approved {
  border-color: var(--color-eager-green);
  color: var(--color-eager-green);
}

/* REPROVADO — sem vermelho na paleta: usa night-ink com destaque. */
.evaluation-panel__seal--rejected {
  border-color: var(--color-night-ink);
  color: var(--color-night-ink);
}

.evaluation-panel__score {
  font-size: var(--text-subheading);
  color: var(--color-charcoal);
}

.evaluation-panel__score strong {
  color: var(--color-night-ink);
}

.evaluation-panel__subheading {
  font-family: var(--font-feather);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-body);
  color: var(--color-charcoal);
  margin-bottom: var(--spacing-8);
}

.evaluation-panel__criteria-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-8);
  list-style: none;
}

.evaluation-panel__criterion {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-12);
  color: var(--color-charcoal);
}

.evaluation-panel__criterion-score {
  font-weight: var(--font-weight-bold);
  color: var(--color-night-ink);
}

.evaluation-panel__text {
  color: var(--color-charcoal);
  line-height: var(--leading-subheading);
}

.evaluation-panel__reasons-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-8);
  padding-left: var(--spacing-24);
  color: var(--color-charcoal);
}

.evaluation-panel__footer {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-16);
  font-size: var(--text-caption);
  color: var(--color-pencil-gray);
}

.evaluation-panel__unavailable {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-8);
}

.evaluation-panel__unavailable-title {
  font-family: var(--font-feather);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-subheading);
  color: var(--color-charcoal);
}
</style>
