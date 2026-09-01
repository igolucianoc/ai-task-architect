<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <main>
    <h1>404 — Página não encontrada</h1>
    <button type="button" @click="() => router.push('/')">Voltar ao início</button>
  </main>
</template>
