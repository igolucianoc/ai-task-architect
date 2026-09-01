<script setup lang="ts">
import AppSpinner from './AppSpinner.vue';

// Contrato do botão base seguindo o DESIGN.md (estilo Duolingo, flat).
const props = withDefaults(
  defineProps<{
    // Variante visual: primário (CTA verde) ou secundário (outline azul).
    variant?: 'primary' | 'secondary';
    // Tipo nativo do botão.
    type?: 'button' | 'submit';
    // Desabilita o botão.
    disabled?: boolean;
    // Estado ocupado: mostra spinner e impede interação.
    loading?: boolean;
  }>(),
  {
    variant: 'primary',
    type: 'button',
    disabled: false,
    loading: false,
  },
);

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();

// Só propaga o clique quando o botão está realmente utilizável.
function handleClick(event: MouseEvent): void {
  if (props.disabled || props.loading) {
    return;
  }
  emit('click', event);
}
</script>

<template>
  <button
    :type="type"
    :class="['base-button', `base-button--${variant}`]"
    :disabled="disabled || loading"
    :aria-busy="loading"
    @click="handleClick"
  >
    <AppSpinner v-if="loading" class="base-button__spinner" label="Processando" />
    <span :class="{ 'base-button__label--loading': loading }">
      <slot />
    </span>
  </button>
</template>

<style scoped>
.base-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-8);
  font-family: var(--font-duolingo-sans);
  font-weight: var(--font-weight-bold);
  border-radius: var(--radius-buttons);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.base-button:disabled {
  cursor: not-allowed;
}

/* Primário — CTA verde preenchido, sem borda. */
.base-button--primary {
  background-color: var(--color-eager-green);
  color: var(--color-paper-white);
  border: none;
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: 0.053em;
  padding: var(--spacing-12) var(--spacing-16);
}

.base-button--primary:hover:not(:disabled) {
  /* Escurece levemente no hover (sem sombra). */
  background-color: #46a302;
}

.base-button--primary:active:not(:disabled) {
  background-color: #3c8e02;
}

.base-button--primary:disabled {
  background-color: var(--color-faded-gray);
  color: var(--color-paper-white);
}

/* Secundário — outline transparente, texto azul. */
.base-button--secondary {
  background-color: transparent;
  color: var(--color-spark-blue);
  border: 2px solid var(--color-faded-gray);
  font-size: 14px;
  padding: var(--spacing-12) var(--spacing-16);
}

.base-button--secondary:hover:not(:disabled) {
  background-color: rgba(28, 176, 246, 0.08);
}

.base-button--secondary:disabled {
  color: var(--color-faded-gray);
}

.base-button:focus-visible {
  outline: 2px solid var(--color-spark-blue);
  outline-offset: 2px;
}

/* Mantém o rótulo perceptível enquanto o spinner ocupa espaço ao lado. */
.base-button__label--loading {
  opacity: 0.85;
}
</style>
