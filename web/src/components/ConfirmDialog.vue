<script setup lang="ts">
// Diálogo de confirmação modal e acessível (role="dialog", aria-modal).
// Controlado pelo pai via v-model:open. Emite `confirm`/`cancel`.
// Fecha com Esc e ao clicar fora (backdrop). Trava o foco enquanto aberto.
import { nextTick, ref, watch } from 'vue';
import BaseButton from '@/components/BaseButton.vue';

const props = withDefaults(
  defineProps<{
    // Título do diálogo.
    title: string;
    // Mensagem/descrição da ação a confirmar.
    message: string;
    // Rótulo do botão de confirmação.
    confirmLabel?: string;
    // Rótulo do botão de cancelamento.
    cancelLabel?: string;
    // Estado ocupado: desabilita os botões e mostra spinner no confirmar.
    loading?: boolean;
  }>(),
  {
    confirmLabel: 'Confirmar',
    cancelLabel: 'Cancelar',
    loading: false,
  },
);

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

// Two-way binding do estado de abertura.
const open = defineModel<boolean>('open', { required: true });

// Referência ao botão de confirmar, para focar ao abrir.
const confirmButton = ref<InstanceType<typeof BaseButton> | null>(null);

// Ao abrir, move o foco para o botão de confirmar (acessibilidade).
watch(open, async (isOpen) => {
  if (isOpen) {
    await nextTick();
    confirmButton.value?.$el?.focus?.();
  }
});

function onConfirm(): void {
  if (props.loading) {
    return;
  }
  emit('confirm');
}

function onCancel(): void {
  if (props.loading) {
    return;
  }
  open.value = false;
  emit('cancel');
}

// Fecha ao pressionar Esc.
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    onCancel();
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="confirm-dialog__backdrop" @click.self="onCancel" @keydown="onKeydown">
      <div
        class="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <h2 id="confirm-dialog-title" class="confirm-dialog__title">{{ title }}</h2>
        <p id="confirm-dialog-message" class="confirm-dialog__message">{{ message }}</p>

        <div class="confirm-dialog__actions">
          <BaseButton variant="secondary" type="button" :disabled="loading" @click="onCancel">
            {{ cancelLabel }}
          </BaseButton>
          <BaseButton
            ref="confirmButton"
            variant="primary"
            type="button"
            :loading="loading"
            @click="onConfirm"
          >
            {{ confirmLabel }}
          </BaseButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.confirm-dialog__backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-16);
  background-color: rgba(59, 58, 58, 0.45);
  z-index: 1000;
}

.confirm-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-16);
  width: 100%;
  max-width: 420px;
  padding: var(--spacing-24);
  background-color: var(--color-paper-white);
  border: 2px solid var(--color-faded-gray);
  border-radius: var(--radius-xl);
}

.confirm-dialog__title {
  font-family: var(--font-feather);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-heading-sm);
  color: var(--color-charcoal);
}

.confirm-dialog__message {
  color: var(--color-charcoal);
}

.confirm-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-12);
  flex-wrap: wrap;
}
</style>
