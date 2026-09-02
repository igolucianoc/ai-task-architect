import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import swc from 'unplugin-swc';

// Config dedicada aos testes E2E: sobe a app Nest real (Postgres + Redis via
// Docker) e exercita os fluxos ponta a ponta. Fica separada do `npm test`
// (unitários) — só inclui `test/**/*.e2e-spec.ts`.
//
// O plugin SWC emite os metadados de decorators (emitDecoratorMetadata), que a
// injeção de dependência do NestJS exige em runtime. Sem ele, guards/filtros que
// dependem de DI (ex.: Reflector no JwtAuthGuard) recebem dependências undefined.
export default defineConfig({
  plugins: [swc.vite()],
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    // Isola os E2E num banco dedicado ANTES de o AppModule carregar a config.
    setupFiles: ['test/e2e-setup.ts'],
    // Fluxos E2E compartilham estado (usuário, tokens, taskId) e o banco, então
    // rodam em sequência — sem paralelismo entre arquivos.
    fileParallelism: false,
    sequence: { concurrent: false },
    // A geração + avaliação assíncrona (BullMQ) pode levar alguns segundos.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
