<script setup lang="ts">
import { RouterView } from 'vue-router';
import AppNav from './components/AppNav.vue';
</script>

<template>
  <AppNav />
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
</style>
