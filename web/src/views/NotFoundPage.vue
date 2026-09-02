<script setup lang="ts">
import { RouterLink } from 'vue-router';
import BaseButton from '@/components/BaseButton.vue';

// Página 404 no mesmo estilo editorial da landing (DESIGN.md).
</script>

<template>
  <main class="not-found">
    <section class="not-found__content">
      <h1 class="not-found__heading">Página não encontrada</h1>

      <p class="not-found__lead">A página que você procura não existe ou foi movida.</p>

      <RouterLink to="/" class="not-found__cta">
        <BaseButton variant="primary">Voltar ao início</BaseButton>
      </RouterLink>
    </section>
  </main>
</template>

<style scoped>
.not-found {
  display: flex;
  justify-content: center;
  padding: var(--spacing-96) var(--spacing-24);
}

.not-found__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 480px;
}

.not-found__heading {
  font-family: var(--font-feather);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-heading);
  line-height: var(--leading-heading);
  letter-spacing: var(--tracking-heading);
  color: var(--color-eager-green);
}

.not-found__lead {
  margin-top: var(--spacing-24);
  font-family: var(--font-duolingo-sans);
  font-weight: var(--font-weight-medium);
  font-size: var(--text-subheading);
  line-height: var(--leading-subheading);
  color: var(--color-pencil-gray);
}

.not-found__cta {
  margin-top: var(--spacing-40);
  text-decoration: none;
}
</style>
