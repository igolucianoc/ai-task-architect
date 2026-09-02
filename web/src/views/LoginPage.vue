<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import AuthCard from '@/components/AuthCard.vue';
import BaseButton from '@/components/BaseButton.vue';
import BaseInput from '@/components/BaseInput.vue';
import { useAuthStore } from '@/stores/auth.store';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const { isLoading, error } = storeToRefs(auth);

// Estado local do formulário (não pertence à store).
const email = ref('');
const password = ref('');
// Sinaliza que houve tentativa de submit, para exibir validação de UX.
const submitted = ref(false);

// Referência ao primeiro campo para foco inicial (acessibilidade).
const emailInput = useTemplateRef('emailInput');

// Validação client-side mínima (apenas UX; o backend valida de verdade).
const emailError = computed(() =>
  submitted.value && email.value.trim() === '' ? 'Informe seu e-mail.' : undefined,
);
const passwordError = computed(() =>
  submitted.value && password.value === '' ? 'Informe sua senha.' : undefined,
);

/**
 * Extrai um destino de redirect seguro da query: apenas caminhos internos
 * (string começando com '/'). Caso contrário, cai para /tasks.
 */
function resolveRedirect(): string {
  const redirect = route.query.redirect;
  if (typeof redirect === 'string' && redirect.startsWith('/')) {
    return redirect;
  }
  return '/tasks';
}

async function handleSubmit(): Promise<void> {
  submitted.value = true;
  // Não submete vazio: evita ida desnecessária ao backend.
  if (email.value.trim() === '' || password.value === '') {
    return;
  }

  await auth.login(email.value, password.value);

  // As actions não relançam: após o await, checamos o resultado pela store.
  if (auth.isAuthenticated) {
    await router.push(resolveRedirect());
  }
}

onMounted(() => {
  // Foco inicial no primeiro campo.
  emailInput.value?.$el.querySelector('input')?.focus();
});
</script>

<template>
  <AuthCard title="Entrar">
    <form class="login-form" novalidate @submit.prevent="handleSubmit">
      <BaseInput
        ref="emailInput"
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
        autocomplete="current-password"
        required
        :error="passwordError"
      />

      <p v-if="error" role="alert" class="login-form__error">{{ error }}</p>

      <BaseButton type="submit" variant="primary" :loading="isLoading" :disabled="isLoading">
        Entrar
      </BaseButton>
    </form>

    <p class="login-form__footer">
      <RouterLink to="/register" class="login-form__link">Criar conta</RouterLink>
    </p>
  </AuthCard>
</template>

<style scoped>
.login-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-16);
}

.login-form__error {
  font-family: var(--font-duolingo-sans);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-caption);
  color: var(--color-night-ink);
}

.login-form__footer {
  margin-top: var(--spacing-24);
  text-align: center;
}

.login-form__link {
  font-family: var(--font-duolingo-sans);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-body);
  color: var(--color-spark-blue);
  border-radius: var(--radius-links);
}

.login-form__link:hover {
  text-decoration: underline;
}
</style>
