<script setup lang="ts">
import { RouterLink } from 'vue-router';
import BaseButton from '@/components/BaseButton.vue';
import { useAuthStore } from '@/stores/auth.store';

// Landing de produto no estilo DESIGN.md. Os CTAs mudam conforme a sessão:
// autenticado navega para as tarefas; visitante é convidado a se cadastrar.
const auth = useAuthStore();
</script>

<template>
  <main class="home">
    <section class="home__hero">
      <h1 class="home__headline">Transforme ideias em especificações</h1>

      <p class="home__lead">
        Descreva uma necessidade técnica em linguagem natural e receba uma especificação de
        implementação estruturada, avaliada por um quality gate.
      </p>

      <div class="home__actions">
        <template v-if="auth.isAuthenticated">
          <RouterLink to="/tasks" class="home__cta">
            <BaseButton variant="primary">Ir para minhas tarefas</BaseButton>
          </RouterLink>
          <RouterLink to="/tasks/new" class="home__cta">
            <BaseButton variant="secondary">Nova tarefa</BaseButton>
          </RouterLink>
        </template>
        <template v-else>
          <RouterLink to="/register" class="home__cta">
            <BaseButton variant="primary">Começar</BaseButton>
          </RouterLink>
          <RouterLink to="/login" class="home__cta">
            <BaseButton variant="secondary">Entrar</BaseButton>
          </RouterLink>
        </template>
      </div>
    </section>
  </main>
</template>

<style scoped>
.home {
  display: flex;
  justify-content: center;
  padding: var(--spacing-96) var(--spacing-24);
}

.home__hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 640px;
}

.home__headline {
  font-family: var(--font-feather);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-heading);
  line-height: var(--leading-heading);
  letter-spacing: var(--tracking-heading);
  color: var(--color-eager-green);
}

.home__lead {
  margin-top: var(--spacing-24);
  max-width: 480px;
  font-family: var(--font-duolingo-sans);
  font-weight: var(--font-weight-medium);
  font-size: var(--text-subheading);
  line-height: var(--leading-subheading);
  color: var(--color-pencil-gray);
}

.home__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--spacing-16);
  margin-top: var(--spacing-40);
}

/* O RouterLink apenas envolve o BaseButton (navegação); sem decoração própria. */
.home__cta {
  text-decoration: none;
}
</style>
