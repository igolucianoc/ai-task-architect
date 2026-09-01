<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import AuthCard from '@/components/AuthCard.vue';
import BaseButton from '@/components/BaseButton.vue';
import BaseInput from '@/components/BaseInput.vue';
import { useAuthStore } from '@/stores/auth.store';

const router = useRouter();
const auth = useAuthStore();
const { isLoading, error } = storeToRefs(auth);

// Estado local do formulário (não pertence à store).
const displayName = ref('');
const email = ref('');
const password = ref('');
// Sinaliza que houve tentativa de submit, para exibir validação de UX.
const submitted = ref(false);

// Referência ao primeiro campo para foco inicial (acessibilidade).
const nameInput = useTemplateRef('nameInput');

// Validação client-side mínima (apenas UX; o backend valida de verdade).
const nameError = computed(() =>
  submitted.value && displayName.value.trim() === '' ? 'Informe seu nome.' : undefined,
);
const emailError = computed(() =>
  submitted.value && email.value.trim() === '' ? 'Informe seu e-mail.' : undefined,
);
const passwordError = computed(() =>
  submitted.value && password.value === '' ? 'Informe uma senha.' : undefined,
);

async function handleSubmit(): Promise<void> {
  submitted.value = true;
  // Não submete vazio: evita ida desnecessária ao backend.
  if (displayName.value.trim() === '' || email.value.trim() === '' || password.value === '') {
    return;
  }

  await auth.register(email.value, password.value, displayName.value);

  // As actions não relançam: após o await, checamos o resultado pela store.
  if (auth.isAuthenticated) {
    await router.push('/tasks');
  }
}

onMounted(() => {
  // Foco inicial no primeiro campo.
  nameInput.value?.$el.querySelector('input')?.focus();
});
</script>

<template>
  <AuthCard title="Criar conta">
    <form class="register-form" novalidate @submit.prevent="handleSubmit">
      <BaseInput
        ref="nameInput"
        v-model="displayName"
        label="Nome"
        type="text"
        autocomplete="name"
        required
        :error="nameError"
      />
      <BaseInput
        v-model="email"
        label="E-mail"
        type="email"
        autocomplete="email"
        required
        :error="emailError"
      />
      <BaseInput
        v-model="password"
        label="Senha"
        type="password"
        autocomplete="new-password"
        required
        :error="passwordError"
      />

      <p v-if="error" role="alert" class="register-form__error">{{ error }}</p>

      <BaseButton type="submit" variant="primary" :loading="isLoading" :disabled="isLoading">
        Criar conta
      </BaseButton>
    </form>

    <p class="register-form__footer">
      <RouterLink to="/login" class="register-form__link">Entrar</RouterLink>
    </p>
  </AuthCard>
</template>

<style scoped>
.register-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-16);
}

.register-form__error {
  font-family: var(--font-duolingo-sans);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-caption);
  color: var(--color-night-ink);
}

.register-form__footer {
  margin-top: var(--spacing-24);
  text-align: center;
}

.register-form__link {
  font-family: var(--font-duolingo-sans);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-body);
  color: var(--color-spark-blue);
  border-radius: var(--radius-links);
}

.register-form__link:hover {
  text-decoration: underline;
}
</style>
