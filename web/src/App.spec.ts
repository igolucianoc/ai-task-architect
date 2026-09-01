import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createPinia } from 'pinia';
import App from './App.vue';

describe('App', () => {
  it('deve renderizar sem erros', () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div>Home</div>' } }],
    });

    const { container } = render(App, {
      global: {
        plugins: [router, createPinia()],
      },
    });

    expect(container).toBeTruthy();
  });
});
