<script setup lang="ts">
import { computed, type DeepReadonly } from 'vue';
import type { StreamStatus } from '@/composables/useTaskGenerationStream';
import type { TaskGenerationEvent, TaskProgressEventName } from '@/services/task-events';
import AppSpinner from '@/components/AppSpinner.vue';

// Componente de UI: exibe o progresso do streaming como uma linha do tempo.
// Recebe a lista de eventos e o status do composable (sem acessar dados direto).
// Usa DeepReadonly para aceitar diretamente os refs readonly do composable.
const props = defineProps<{
  // Eventos recebidos, em ordem de chegada (readonly vindo do composable).
  events: DeepReadonly<TaskGenerationEvent[]>;
  // Status atual da conexão de streaming.
  status: StreamStatus;
}>();

// Passos de progresso, na ordem em que ocorrem, com rótulo e uma descrição de
// fallback em pt-BR (usada quando o evento não traz `message`).
const STEPS: ReadonlyArray<{
  event: TaskProgressEventName;
  label: string;
  hint: string;
}> = [
  { event: 'started', label: 'Iniciando', hint: 'Preparando a geração da especificação.' },
  {
    event: 'analyzing_context',
    label: 'Analisando contexto',
    hint: 'Interpretando a necessidade e consultando o modelo. Isso pode levar alguns segundos.',
  },
  {
    event: 'generating_requirements',
    label: 'Elaborando requisitos',
    hint: 'Elaborando requisitos funcionais e não funcionais.',
  },
  {
    event: 'generating_acceptance_criteria',
    label: 'Definindo critérios de aceite',
    hint: 'Derivando os critérios de aceite.',
  },
  { event: 'evaluating', label: 'Revisando', hint: 'Validando e organizando o resultado.' },
];

// Mostra o spinner enquanto a conexão está em andamento.
const isActive = computed(() => props.status === 'connecting' || props.status === 'streaming');

// Nomes de evento de progresso já recebidos (para marcar passos concluídos/atuais).
const receivedEvents = computed<Set<TaskProgressEventName>>(() => {
  const received = new Set<TaskProgressEventName>();
  for (const event of props.events) {
    if (event.event !== 'completed' && event.event !== 'failed') {
      received.add(event.event);
    }
  }
  return received;
});

// Índice do passo atual: o último passo de progresso já recebido.
const currentStepIndex = computed(() => {
  let index = -1;
  STEPS.forEach((step, i) => {
    if (receivedEvents.value.has(step.event)) {
      index = i;
    }
  });
  return index;
});

// Rótulo do passo atual, anunciado por leitores de tela (aria-live).
const currentStepLabel = computed(() =>
  currentStepIndex.value >= 0 ? STEPS[currentStepIndex.value].label : 'Conectando',
);

// Último evento de progresso recebido (o mais recente que não é terminal).
const lastProgressEvent = computed(() => {
  for (let i = props.events.length - 1; i >= 0; i -= 1) {
    const event = props.events[i];
    if (event.event !== 'completed' && event.event !== 'failed') {
      return event;
    }
  }
  return null;
});

// Descrição do passo atual: prioriza a mensagem vinda do evento; se ausente,
// usa o hint do passo. Dá ao usuário a percepção de atividade durante a espera.
const currentStepHint = computed(() => {
  if (!isActive.value) {
    return '';
  }
  const message = lastProgressEvent.value?.message;
  if (typeof message === 'string' && message.length > 0) {
    return message;
  }
  if (currentStepIndex.value >= 0) {
    return STEPS[currentStepIndex.value].hint;
  }
  return 'Conectando ao servidor de geração.';
});

// Estado visual de cada passo: concluído, atual ou pendente.
type StepState = 'done' | 'current' | 'pending';

function stepState(index: number): StepState {
  if (index < currentStepIndex.value) {
    return 'done';
  }
  if (index === currentStepIndex.value) {
    return 'current';
  }
  return 'pending';
}
</script>

<template>
  <div class="generation-progress" role="status">
    <div class="generation-progress__heading">
      <AppSpinner v-if="isActive" label="Gerando especificação" />
      <p class="generation-progress__current" aria-live="polite">{{ currentStepLabel }}</p>
    </div>

    <p v-if="currentStepHint" class="generation-progress__hint" aria-live="polite">
      {{ currentStepHint }}
    </p>

    <ol class="generation-progress__steps">
      <li
        v-for="(step, index) in STEPS"
        :key="step.event"
        :class="[
          'generation-progress__step',
          `generation-progress__step--${stepState(index)}`,
          { 'generation-progress__step--active': stepState(index) === 'current' && isActive },
        ]"
        :aria-current="stepState(index) === 'current' ? 'step' : undefined"
      >
        <span class="generation-progress__marker" aria-hidden="true"></span>
        <span class="generation-progress__label">{{ step.label }}</span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.generation-progress {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-16);
}

.generation-progress__heading {
  display: flex;
  align-items: center;
  gap: var(--spacing-12);
  color: var(--color-charcoal);
}

.generation-progress__current {
  font-family: var(--font-duolingo-sans);
  font-weight: var(--font-weight-bold);
  color: var(--color-charcoal);
}

.generation-progress__hint {
  font-size: var(--text-caption);
  color: var(--color-pencil-gray);
  margin-top: calc(-1 * var(--spacing-8));
}

.generation-progress__steps {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-12);
  list-style: none;
}

.generation-progress__step {
  display: flex;
  align-items: center;
  gap: var(--spacing-12);
  color: var(--color-pencil-gray);
}

.generation-progress__marker {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid var(--color-faded-gray);
  border-radius: 50%;
  background-color: var(--color-paper-white);
  flex-shrink: 0;
}

/* Passo concluído: marcador preenchido de verde (destaque positivo). */
.generation-progress__step--done .generation-progress__marker {
  border-color: var(--color-eager-green);
  background-color: var(--color-eager-green);
}

.generation-progress__step--done .generation-progress__label {
  color: var(--color-charcoal);
}

/* Passo atual: destaque em azul + rótulo em negrito. */
.generation-progress__step--current .generation-progress__marker {
  border-color: var(--color-spark-blue);
}

.generation-progress__step--current .generation-progress__label {
  color: var(--color-spark-blue);
  font-weight: var(--font-weight-bold);
}

/* Passo atual e ativo (stream em andamento): marcador pulsa para indicar
   trabalho em curso, mesmo quando o passo demora (espera pelo LLM). */
.generation-progress__step--active .generation-progress__marker {
  background-color: var(--color-spark-blue);
  animation: generation-progress-pulse 1.4s ease-in-out infinite;
}

@keyframes generation-progress-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(28, 176, 246, 0.5);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(28, 176, 246, 0);
  }
}

/* Acessibilidade: desativa a animação para quem prefere menos movimento. */
@media (prefers-reduced-motion: reduce) {
  .generation-progress__step--active .generation-progress__marker {
    animation: none;
  }
}
</style>
