import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createPinia } from 'pinia';
import App from './App.vue';

describe('App', () => {
  it('deve renderizar o nav e o conteúdo da rota', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div>Página inicial</div>' } }],
    });

    router.push('/');
    await router.isReady();

    render(App, {
      global: {
        plugins: [router, createPinia()],
      },
    });

    // Nav presente (marca do produto).
    expect(screen.getByRole('link', { name: 'AI Task Architect' })).toBeInTheDocument();
    // Conteúdo da rota renderizado pelo RouterView.
    expect(screen.getByText('Página inicial')).toBeInTheDocument();
  });
});
