<script setup lang="ts">
import { RouterLink } from 'vue-router';

// Barra de topo minimalista. Desacoplada da auth store (que ainda não existe):
// o estado de autenticação chega via prop e as ações via slot.
withDefaults(
  defineProps<{
    // Quando true, exibe os links de navegação autenticada.
    authenticated?: boolean;
  }>(),
  {
    authenticated: false,
  },
);
</script>

<template>
  <header class="app-nav">
    <nav class="app-nav__inner" aria-label="Navegação principal">
      <RouterLink to="/" class="app-nav__brand">AI Task Architect</RouterLink>

      <div class="app-nav__actions">
        <template v-if="authenticated">
          <RouterLink to="/tasks" class="app-nav__link">Tarefas</RouterLink>
          <RouterLink to="/tasks/new" class="app-nav__link">Nova tarefa</RouterLink>
        </template>
        <!-- Slot para ações extras (ex.: botão de sair) — integração com a store
             virá em fatia posterior. -->
        <slot name="actions" />
      </div>
    </nav>
  </header>
</template>

<style scoped>
.app-nav {
  border-bottom: 2px solid var(--color-faded-gray);
  background-color: var(--color-paper-white);
}

.app-nav__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-16);
  max-width: var(--page-max-width);
  margin: 0 auto;
  padding: var(--spacing-16) var(--spacing-24);
}

.app-nav__brand {
  font-family: var(--font-feather);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-subheading);
  color: var(--color-eager-green);
  text-decoration: none;
}

.app-nav__actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-16);
}

.app-nav__link {
  font-family: var(--font-duolingo-sans);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-nav-label);
  color: var(--color-spark-blue);
  text-decoration: none;
  border-radius: var(--radius-nav-items);
}

.app-nav__link:hover {
  text-decoration: underline;
}
</style>
