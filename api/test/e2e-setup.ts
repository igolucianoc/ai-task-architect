// Setup dos testes E2E, executado ANTES de qualquer import do AppModule.
//
// Aponta a app para um banco DEDICADO de teste (`..._test`), isolando os E2E do
// banco de desenvolvimento — os testes fazem TRUNCATE, então JAMAIS podem rodar
// contra o banco de dev. Se um `DATABASE_URL` de teste já vier do ambiente
// (ex.: .env.test carregado pelo runner), respeitamos; senão, derivamos do
// `DATABASE_URL` atual trocando o nome do banco para `<nome>_test`.

process.env.NODE_ENV = 'test';

function toTestDatabaseUrl(url: string): string {
  // Substitui o path do banco (último segmento antes de eventual query string).
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.endsWith('_test')) {
      parsed.pathname = `${parsed.pathname}_test`;
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

const current = process.env.DATABASE_URL;
if (current && !current.includes('_test')) {
  process.env.DATABASE_URL = toTestDatabaseUrl(current);
}

// Isola a fila BullMQ num DB Redis dedicado (índice 1). Sem isso, o worker da
// app em execução (container, DB 0) compete pelos jobs de avaliação do E2E e os
// descarta como "task inexistente" (ele consulta o banco de dev, não o _test).
const redis = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.REDIS_URL = redis.replace(/\/\d+$/, '') + '/1';

// Salvaguarda dura: os E2E truncam tabelas. Se, por qualquer motivo, o banco
// alvo não for claramente um banco de teste, aborta antes de tocar em dados.
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes('_test')) {
  throw new Error(
    'E2E abortado: DATABASE_URL deve apontar para um banco de teste (contendo "_test"). ' +
      'Isso evita truncar o banco de desenvolvimento.',
  );
}
