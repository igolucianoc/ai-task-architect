<script setup lang="ts">
import { computed } from 'vue';

// Pequeno badge (pill) que traduz o status do backend para um rótulo pt-BR
// e um estilo dentro da paleta do DESIGN.md (verde só em COMPLETED; azul/cinza
// nos demais). Não inventa cores fora da paleta.

const props = defineProps<{
  // Status cru vindo do backend (PENDING | STREAMING | COMPLETED | FAILED | ...).
  status: string;
}>();

// Variantes visuais possíveis (mapeadas para classes com cores da paleta).
type BadgeVariant = 'success' | 'info' | 'neutral';

// Configuração por status: rótulo pt-BR + variante de cor.
const STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  PENDING: { label: 'Pendente', variant: 'neutral' },
  STREAMING: { label: 'Gerando', variant: 'info' },
  COMPLETED: { label: 'Concluída', variant: 'success' },
  FAILED: { label: 'Falhou', variant: 'neutral' },
};

// Fallback seguro para status desconhecidos: mostra o valor cru em estilo neutro.
const config = computed(
  () => STATUS_CONFIG[props.status] ?? { label: props.status, variant: 'neutral' as BadgeVariant },
);
</script>

<template>
  <span :class="['task-status-badge', `task-status-badge--${config.variant}`]">
    {{ config.label }}
  </span>
</template>

<style scoped>
.task-status-badge {
  display: inline-flex;
  align-items: center;
  font-family: var(--font-duolingo-sans);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-caption);
  /* Pill: radius 12px, borda 2px, flat (sem sombra). */
  border-radius: var(--radius-xl);
  border: 2px solid var(--color-faded-gray);
  padding: 2px var(--spacing-12);
  background-color: var(--color-paper-white);
}

/* COMPLETED — único caso com verde (destaque positivo). */
.task-status-badge--success {
  border-color: var(--color-eager-green);
  color: var(--color-eager-green);
}

/* STREAMING — em andamento, azul de destaque. */
.task-status-badge--info {
  border-color: var(--color-spark-blue);
  color: var(--color-spark-blue);
}

/* PENDING/FAILED/desconhecido — neutro em cinza. */
.task-status-badge--neutral {
  border-color: var(--color-faded-gray);
  color: var(--color-charcoal);
}
</style>
