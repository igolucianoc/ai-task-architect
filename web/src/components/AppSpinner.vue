<script setup lang="ts">
// Indicador de carregamento simples e acessível, em CSS puro (sem libs).
withDefaults(
  defineProps<{
    // Rótulo acessível anunciado por leitores de tela.
    label?: string;
  }>(),
  {
    label: 'Carregando',
  },
);
</script>

<template>
  <span class="app-spinner" role="status" :aria-label="label">
    <span class="app-spinner__circle" aria-hidden="true"></span>
  </span>
</template>

<style scoped>
.app-spinner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.app-spinner__circle {
  display: inline-block;
  width: 1em;
  height: 1em;
  border: 2px solid var(--color-faded-gray);
  /* A borda superior usa a cor corrente para herdar o contexto do botão/texto. */
  border-top-color: currentColor;
  border-radius: 50%;
  animation: app-spinner-spin 0.6s linear infinite;
}

@keyframes app-spinner-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Respeita a preferência de reduzir movimento. */
@media (prefers-reduced-motion: reduce) {
  .app-spinner__circle {
    animation-duration: 1.5s;
  }
}
</style>
