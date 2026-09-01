<script setup lang="ts">
import { computed, type DeepReadonly } from 'vue';
import type { TaskSpecification } from '@/services/task-events';

// Componente de UI: renderiza a especificação gerada de forma legível.
// Recebe a specification (não-null) como prop e apresenta as seções.
// DeepReadonly aceita tanto a spec do store quanto o ref readonly do stream.
const props = defineProps<{
  specification: DeepReadonly<TaskSpecification>;
}>();

// Descreve cada seção de lista: chave da spec + título pt-BR.
interface ListSection {
  key: keyof Pick<
    TaskSpecification,
    | 'functionalRequirements'
    | 'nonFunctionalRequirements'
    | 'acceptanceCriteria'
    | 'technicalTasks'
    | 'risks'
    | 'dependencies'
    | 'definitionOfDone'
  >;
  title: string;
}

// Ordem de exibição e rótulos pt-BR das listas.
const LIST_SECTIONS: readonly ListSection[] = [
  { key: 'functionalRequirements', title: 'Requisitos funcionais' },
  { key: 'nonFunctionalRequirements', title: 'Requisitos não funcionais' },
  { key: 'acceptanceCriteria', title: 'Critérios de aceite' },
  { key: 'technicalTasks', title: 'Tarefas técnicas' },
  { key: 'risks', title: 'Riscos' },
  { key: 'dependencies', title: 'Dependências' },
  { key: 'definitionOfDone', title: 'Definition of Done' },
];

// Só exibe as seções cujas listas têm ao menos um item.
const visibleSections = computed(() =>
  LIST_SECTIONS.map((section) => ({
    ...section,
    items: props.specification[section.key],
  })).filter((section) => section.items.length > 0),
);
</script>

<template>
  <article class="specification-view">
    <h1 class="specification-view__title">{{ specification.title }}</h1>

    <section v-if="specification.context" class="specification-view__section">
      <h2 class="specification-view__heading">Contexto</h2>
      <p class="specification-view__text">{{ specification.context }}</p>
    </section>

    <section v-if="specification.objective" class="specification-view__section">
      <h2 class="specification-view__heading">Objetivo</h2>
      <p class="specification-view__text">{{ specification.objective }}</p>
    </section>

    <section
      v-for="section in visibleSections"
      :key="section.key"
      class="specification-view__section"
    >
      <h2 class="specification-view__heading">{{ section.title }}</h2>
      <ul class="specification-view__list">
        <li v-for="(item, index) in section.items" :key="index" class="specification-view__item">
          {{ item }}
        </li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
.specification-view {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-24);
}

.specification-view__title {
  font-family: var(--font-feather);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-heading-sm);
  color: var(--color-eager-green);
}

.specification-view__section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-8);
}

.specification-view__heading {
  font-family: var(--font-feather);
  font-weight: var(--font-weight-bold);
  font-size: var(--text-subheading);
  color: var(--color-eager-green);
}

.specification-view__text {
  color: var(--color-charcoal);
  line-height: var(--leading-subheading);
}

.specification-view__list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-8);
  padding-left: var(--spacing-24);
}

.specification-view__item {
  color: var(--color-charcoal);
  line-height: var(--leading-subheading);
}
</style>
