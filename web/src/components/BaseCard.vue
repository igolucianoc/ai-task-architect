<script setup lang="ts">
// Superfície branca flat (sem sombra), borda 2px e radius 12px conforme DESIGN.md.
</script>

<template>
  <div class="base-card">
    <slot />
  </div>
</template>

<style scoped>
.base-card {
  background-color: var(--color-paper-white);
  border: 2px solid var(--color-faded-gray);
  border-radius: var(--radius-xl);
  padding: var(--spacing-24);
}
</style>
