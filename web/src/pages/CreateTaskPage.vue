<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useTasksStore } from '@/stores/tasks.store';
import BaseButton from '@/components/BaseButton.vue';
import BaseCard from '@/components/BaseCard.vue';
import BaseTextarea from '@/components/BaseTextarea.vue';

// Limites de tamanho da descrição (o backend valida de verdade; aqui é UX).
const MIN_LENGTH = 50;
const MAX_LENGTH = 2000;

const router = useRouter();
const tasksStore = useTasksStore();
const { isLoading, error } = storeToRefs(tasksStore);

// Estado local do formulário.
const description = ref('');
// Sinaliza que o usuário já tentou submeter (para mostrar erro só depois disso).
const submitted = ref(false);

const trimmedLength = computed(() => description.value.trim().length);
const isValid = computed(
  () => trimmedLength.value >= MIN_LENGTH && trimmedLength.value <= MAX_LENGTH,
);

// Mensagem de validação de UX exibida somente após uma tentativa de submit.
const validationError = computed(() => {
  if (!submitted.value || isValid.value) {
    return undefined;
  }
  if (trimmedLength.value < MIN_LENGTH) {
    return `A descrição precisa ter ao menos ${MIN_LENGTH} caracteres.`;
  }
  return `A descrição pode ter no máximo ${MAX_LENGTH} caracteres.`;
});

async function handleSubmit(): Promise<void> {
  submitted.value = true;
  if (!isValid.value) {
    return;
  }
  const id = await tasksStore.create(description.value.trim());
  if (id !== null) {
    void router.push(`/tasks/${id}`);
  }
  // Em erro, `error` da store já reflete a mensagem (exibida com role=alert).
}
</script>

<template>
  <section class="create-task-page">
    <h1 class="create-task-page__title">Nova tarefa</h1>

    <BaseCard>
      <form class="create-task-page__form" novalidate @submit.prevent="handleSubmit">
        <BaseTextarea
          v-model="description"
          label="Descrição da necessidade técnica"
          placeholder="Descreva em linguagem natural o que precisa ser implementado..."
          :maxlength="MAX_LENGTH"
          :error="validationError"
          required
        />
        <p class="create-task-page__help">
          A descrição precisa ter entre {{ MIN_LENGTH }} e {{ MAX_LENGTH }} caracteres.
        </p>

        <p v-if="error" role="alert" class="create-task-page__error">{{ error }}</p>

        <BaseButton variant="primary" type="submit" :disabled="!isValid" :loading="isLoading">
          Gerar especificação
        </BaseButton>
      </form>
    </BaseCard>
  </section>
</template>

<style scoped>
.create-task-page {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-24);
  max-width: 640px;
  margin: 0 auto;
}

.create-task-page__title {
  font-family: var(--font-feather);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-heading-sm);
  color: var(--color-eager-green);
  text-align: center;
}

.create-task-page__form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-16);
}

.create-task-page__help {
  font-size: var(--text-caption);
  color: var(--color-pencil-gray);
}

.create-task-page__error {
  font-weight: var(--font-weight-bold);
  color: var(--color-night-ink);
}
</style>
