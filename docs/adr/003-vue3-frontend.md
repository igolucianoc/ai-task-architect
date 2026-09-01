# ADR-003 — Vue 3 como framework de frontend

**Data:** 2026-09-01  
**Status:** Aceito

## Contexto

O frontend precisa de uma SPA com formulário de entrada, visualização de streaming SSE em tempo real,
histórico paginado e autenticação. Precisamos escolher o framework.

## Decisão

Usar **Vue 3** com TypeScript, Composition API e `<script setup>`, scaffoldado via Vite.

## Justificativa

- Vue 3 com Composition API e `<script setup>` é idiomático, limpo e bem tipado com TypeScript.
- Vite como bundler oferece DX excelente (HMR instantâneo, build rápido).
- `EventSource` nativo do browser é suficiente para consumir o endpoint SSE da API.
- Pinia para estado global é simples e totalmente tipado.
- Vue Router para navegação entre páginas (login, home, histórico, detalhe de tarefa).
- O `DESIGN.md` define um design system com CSS custom properties — Vue com scoped styles ou
  Tailwind v4 se integra naturalmente.

## Alternativas consideradas

| Opção | Motivo de descarte |
|-------|-------------------|
| React | Igualmente válido, mas Vue 3 + Composition API demonstra stack alternativa relevante |
| Nuxt 3 | SSR não agrega valor nesta aplicação autenticada; adiciona complexidade |
| Svelte / SvelteKit | Menos reconhecido em contextos corporativos brasileiros neste momento |

## Consequências

- Toda lógica de componente em `<script setup lang="ts">` — sem Options API.
- Sem `any` nos componentes; props tipadas com `defineProps<{...}>()`.
- Estado global gerenciado por Pinia stores.
- Roteamento com Vue Router 4, guards de rota para proteção de páginas autenticadas.
- Estilos seguem exclusivamente o `DESIGN.md` — tokens CSS custom properties ou Tailwind v4.
- `@vue/test-utils` + Vitest para testes de componentes críticos.
