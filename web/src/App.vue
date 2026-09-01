<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { RouterView, useRouter } from 'vue-router';
import { useAuthStore } from './stores/auth.store';
import AppNav from './components/AppNav.vue';
import BaseButton from './components/BaseButton.vue';

// App.vue integra a auth store e repassa o estado ao AppNav (que é genérico
// e não conhece a store). As ações autenticadas vão pelo slot #actions.
const router = useRouter();
const auth = useAuthStore();
const { isAuthenticated, user } = storeToRefs(auth);

// Encerra a sessão e leva o usuário de volta ao login.
async function handleLogout(): Promise<void> {
  await auth.logout();
  void router.push('/login');
}
</script>

<template>
  <AppNav :authenticated="isAuthenticated">
    <template #actions>
      <template v-if="isAuthenticated">
        <span v-if="user" class="app__user">{{ user.displayName }}</span>
        <BaseButton variant="secondary" type="button" @click="handleLogout">Sair</BaseButton>
      </template>
    </template>
  </AppNav>
  <main class="app-main">
    <RouterView />
  </main>
</template>

<style scoped>
.app-main {
  max-width: var(--page-max-width);
  margin: 0 auto;
  padding: var(--spacing-24);
}

.app__user {
  font-family: var(--font-duolingo-sans);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-nav-label);
  color: var(--color-charcoal);
}
</style>
