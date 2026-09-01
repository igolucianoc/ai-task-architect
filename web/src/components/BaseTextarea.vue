<script setup lang="ts">
import { computed, useId } from 'vue';

// Two-way binding via defineModel.
const model = defineModel<string>({ default: '' });

const props = withDefaults(
  defineProps<{
    // Texto do rótulo, associado ao textarea por id.
    label: string;
    placeholder?: string;
    // Mensagem de erro; quando presente, aplica estado de erro acessível.
    error?: string;
    required?: boolean;
    // Limite de caracteres; quando definido, exibe contador acessível.
    maxlength?: number;
  }>(),
  {
    placeholder: undefined,
    error: undefined,
    required: false,
    maxlength: undefined,
  },
);

// Ids estáveis para ligar label, textarea, erro e contador.
const textareaId = useId();
const errorId = useId();
const counterId = useId();

const hasError = computed(() => Boolean(props.error));
const hasCounter = computed(() => props.maxlength !== undefined);
const charCount = computed(() => model.value.length);

// Reúne os ids descritivos (erro + contador) para aria-describedby.
const describedBy = computed(() => {
  const ids: string[] = [];
  if (hasError.value) {
    ids.push(errorId);
  }
  if (hasCounter.value) {
    ids.push(counterId);
  }
  return ids.length > 0 ? ids.join(' ') : undefined;
});
</script>

<template>
  <div class="base-textarea">
    <label :for="textareaId" class="base-textarea__label">
      {{ label }}
      <span v-if="required" aria-hidden="true">*</span>
    </label>
    <textarea
      :id="textareaId"
      v-model="model"
      :placeholder="placeholder"
      :required="required"
      :maxlength="maxlength"
      :aria-invalid="hasError"
      :aria-describedby="describedBy"
      :class="['base-textarea__field', { 'base-textarea__field--error': hasError }]"
    ></textarea>
    <div class="base-textarea__meta">
      <p v-if="hasError" :id="errorId" role="alert" class="base-textarea__error">
        {{ error }}
      </p>
      <p v-if="hasCounter" :id="counterId" class="base-textarea__counter" aria-live="polite">
        {{ charCount }} / {{ maxlength }} caracteres
      </p>
    </div>
  </div>
</template>

<style scoped>
.base-textarea {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-8);
}

.base-textarea__label {
  font-family: var(--font-duolingo-sans);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-body);
  color: var(--color-charcoal);
}

.base-textarea__field {
  font-family: var(--font-duolingo-sans);
  font-size: var(--text-body);
  color: var(--color-charcoal);
  background-color: var(--color-paper-white);
  border: 2px solid var(--color-faded-gray);
  border-radius: var(--radius-xl);
  padding: var(--spacing-12) var(--spacing-16);
  min-height: 120px;
  resize: vertical;
}

.base-textarea__field::placeholder {
  color: var(--color-pencil-gray);
}

.base-textarea__field:focus-visible {
  outline: none;
  border-color: var(--color-spark-blue);
}

/* Sem vermelho na paleta: erro sinalizado por night-ink + role="alert". */
.base-textarea__field--error {
  border-color: var(--color-night-ink);
}

.base-textarea__meta {
  display: flex;
  justify-content: space-between;
  gap: var(--spacing-8);
}

.base-textarea__error {
  font-family: var(--font-duolingo-sans);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-caption);
  color: var(--color-night-ink);
}

.base-textarea__counter {
  margin-left: auto;
  font-family: var(--font-duolingo-sans);
  font-size: var(--text-caption);
  color: var(--color-pencil-gray);
}
</style>
