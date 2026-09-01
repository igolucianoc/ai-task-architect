<script setup lang="ts">
import BaseCard from './BaseCard.vue';

// Layout compartilhado das telas de autenticação: cartão centralizado com
// largura máxima (~420px) e título como <h1>. O conteúdo do formulário vem
// pelo slot padrão; o título vem pela prop `title`.
defineProps<{
  // Título da tela, renderizado como heading principal (<h1>).
  title: string;
}>();
</script>

<template>
  <main class="auth-card">
    <BaseCard class="auth-card__surface">
      <h1 class="auth-card__title">{{ title }}</h1>
      <slot />
    </BaseCard>
  </main>
</template>

<style scoped>
.auth-card {
  display: flex;
  justify-content: center;
  padding: var(--spacing-24) 0;
}

.auth-card__surface {
  width: 100%;
  max-width: 420px;
}

.auth-card__title {
  font-family: var(--font-duolingo-sans);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-heading-sm);
  line-height: var(--leading-heading-sm);
  color: var(--color-night-ink);
  margin-bottom: var(--spacing-24);
}
</style>
