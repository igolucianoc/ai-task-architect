<script setup lang="ts">
import { computed, useId } from 'vue';

// Two-way binding via defineModel (Vue 3.4+).
const model = defineModel<string>({ default: '' });

const props = withDefaults(
  defineProps<{
    // Texto do rótulo, associado ao input por id.
    label: string;
    // Tipo nativo do input.
    type?: string;
    placeholder?: string;
    // Mensagem de erro; quando presente, aplica estado de erro acessível.
    error?: string;
    required?: boolean;
    autocomplete?: string;
  }>(),
  {
    type: 'text',
    placeholder: undefined,
    error: undefined,
    required: false,
    autocomplete: undefined,
  },
);

// Ids estáveis para ligar label, input e mensagem de erro.
const inputId = useId();
const errorId = useId();

const hasError = computed(() => Boolean(props.error));
</script>

<template>
  <div class="base-input">
    <label :for="inputId" class="base-input__label">
      {{ label }}
      <span v-if="required" aria-hidden="true">*</span>
    </label>
    <input
      :id="inputId"
      v-model="model"
      :type="type"
      :placeholder="placeholder"
      :required="required"
      :autocomplete="autocomplete"
      :aria-invalid="hasError"
      :aria-describedby="hasError ? errorId : undefined"
      :class="['base-input__field', { 'base-input__field--error': hasError }]"
    />
    <p v-if="hasError" :id="errorId" role="alert" class="base-input__error">
      {{ error }}
    </p>
  </div>
</template>

<style scoped>
.base-input {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-8);
}

.base-input__label {
  font-family: var(--font-duolingo-sans);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-body);
  color: var(--color-charcoal);
}

.base-input__field {
  font-family: var(--font-duolingo-sans);
  font-size: var(--text-body);
  color: var(--color-charcoal);
  background-color: var(--color-paper-white);
  border: 2px solid var(--color-faded-gray);
  border-radius: var(--radius-xl);
  padding: var(--spacing-12) var(--spacing-16);
}

.base-input__field::placeholder {
  color: var(--color-pencil-gray);
}

.base-input__field:focus-visible {
  outline: none;
  border-color: var(--color-spark-blue);
}

/* A paleta do DESIGN.md não inclui vermelho; o estado de erro é sinalizado por
   borda em night-ink (contraste forte) somado à mensagem com role="alert". */
.base-input__field--error {
  border-color: var(--color-night-ink);
}

.base-input__error {
  font-family: var(--font-duolingo-sans);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-caption);
  color: var(--color-night-ink);
}
</style>
