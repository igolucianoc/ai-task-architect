import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import request from 'supertest';
import type { Server } from 'node:http';
import { createE2EApp, cleanDatabase, closeE2EApp, type E2EApp } from './e2e-app';

/**
 * E2E dos 7 fluxos críticos, encenados EM ORDEM sobre a app Nest real
 * (supertest + AppModule, com LLM_PROVIDER sobrescrito pelo FakeLlmProvider):
 *
 *   1. register + login (accessToken + cookie de refresh)
 *   2. refresh (rotaciona o refresh token)
 *   3. criar tarefa (POST /api/tasks -> PENDING)
 *   4. acompanhar execução via stream SSE (dispara a geração)
 *   5. geração concluída (tarefa COMPLETED com artifact/specification)
 *   6. avaliação (job BullMQ persiste TaskEvaluation -> polling curto)
 *   7. histórico (GET /api/tasks paginado lista a tarefa)
 *
 * O estado (usuário, tokens, taskId) é reaproveitado entre os passos, então os
 * testes rodam em sequência no mesmo arquivo. Requer Postgres + Redis no ar.
 */

/** E-mail único por execução: evita colisão de unique caso a limpeza falhe. */
const RUN_ID = Date.now().toString(36);
const USER = {
  email: `e2e-${RUN_ID}@example.com`,
  password: 'senha-super-secreta-123',
  displayName: 'Usuária E2E',
};

/** Descrição válida (>= 50 caracteres) para POST /api/tasks. */
const TASK_DESCRIPTION =
  'Como usuário, quero um fluxo de cadastro com verificação de e-mail e ' +
  'recuperação de senha, cobrindo casos de erro e mensagens claras ao usuário.';

/** Resposta de register/login/refresh: usuário + accessToken. */
interface AuthResponse {
  user: { email: string; displayName: string };
  accessToken: string;
}

/** Resposta de POST /api/tasks: identificador e status inicial. */
interface CreatedTask {
  taskId: string;
  status: string;
}

/** Resposta de GET /api/tasks/:id: detalhe da tarefa. */
interface TaskDetailResponse {
  status: string;
  specification: { title: string; functionalRequirements: unknown[] } | null;
  evaluation: { status: string } | null;
}

/** Resposta de GET /api/tasks: histórico paginado. */
interface TaskListResponse {
  page: number;
  pageSize: number;
  total: number;
  items: { id: string }[];
}

/**
 * Extrai o valor do cookie refresh_token de um header Set-Cookie. O supertest
 * tipa `set-cookie` como `string | string[]`; normalizamos para array antes de
 * procurar o cookie.
 */
function extractRefreshCookie(setCookie: string | string[] | undefined): string {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const raw = cookies.find((c) => c.startsWith('refresh_token='));
  if (!raw) {
    throw new Error('cookie refresh_token não encontrado na resposta');
  }
  return raw.split(';')[0];
}

/**
 * Consome o stream SSE por um curto período para DISPARAR a geração. Abre a
 * conexão, lê os bytes recebidos por até `windowMs` (ou até ver o evento
 * `completed`/`failed`), e então encerra. Retorna o texto bruto acumulado — o
 * estado final é validado depois via GET. Abordagem pragmática recomendada no
 * enunciado: o supertest não é um cliente SSE, então lemos o response stream.
 */
async function consumeStream(
  baseUrl: string,
  taskId: string,
  token: string,
  windowMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, windowMs);
  let buffer = '';

  try {
    const res = await fetch(
      `${baseUrl}/api/tasks/${taskId}/stream?token=${encodeURIComponent(token)}`,
      { headers: { Accept: 'text/event-stream' }, signal: controller.signal },
    );
    const body = res.body;
    if (!body) {
      return buffer;
    }
    const reader = body.getReader();
    const decoder = new TextDecoder();
    // Lê o stream até ver um evento terminal ou a janela expirar (abort).
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      if (buffer.includes('event: completed') || buffer.includes('event: failed')) {
        break;
      }
    }
  } catch (err) {
    // AbortError é esperado quando a janela expira; propaga erros reais.
    if (!(err instanceof Error) || err.name !== 'AbortError') {
      throw err;
    }
  } finally {
    clearTimeout(timer);
    controller.abort();
  }

  return buffer;
}

/** Aguarda `ms` milissegundos. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe('Ciclo de vida da tarefa (E2E)', () => {
  let e2e: E2EApp;
  let server: Server;

  // Estado reaproveitado entre os passos.
  let accessToken = '';
  let refreshCookie = '';
  let taskId = '';

  beforeAll(async () => {
    e2e = await createE2EApp();
    await cleanDatabase(e2e.prisma);
    server = e2e.app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await cleanDatabase(e2e.prisma);
    await closeE2EApp(e2e);
  });

  it('1. register + login: recebe accessToken e cookie de refresh', async () => {
    // Register
    const registerRes = await request(server).post('/api/auth/register').send(USER).expect(201);

    const registerBody = registerRes.body as AuthResponse;
    expect(registerBody).toMatchObject({
      user: { email: USER.email, displayName: USER.displayName },
    });
    expect(typeof registerBody.accessToken).toBe('string');
    expect(registerBody.accessToken.length).toBeGreaterThan(0);
    expect(extractRefreshCookie(registerRes.headers['set-cookie'])).toContain('refresh_token=');

    // Login (fonte da verdade dos tokens reaproveitados adiante)
    const loginRes = await request(server)
      .post('/api/auth/login')
      .send({ email: USER.email, password: USER.password })
      .expect(200);

    const loginBody = loginRes.body as AuthResponse;
    expect(loginBody.user.email).toBe(USER.email);
    accessToken = loginBody.accessToken;
    refreshCookie = extractRefreshCookie(loginRes.headers['set-cookie']);

    expect(accessToken.length).toBeGreaterThan(0);
    expect(refreshCookie).toContain('refresh_token=');
  });

  it('2. refresh: rotaciona o refresh token', async () => {
    const res = await request(server)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(200);

    const body = res.body as AuthResponse;
    expect(typeof body.accessToken).toBe('string');
    expect(body.accessToken.length).toBeGreaterThan(0);

    const rotated = extractRefreshCookie(res.headers['set-cookie']);
    // Rotação: o novo cookie de refresh difere do anterior.
    expect(rotated).not.toBe(refreshCookie);

    // Passa a usar os tokens rotacionados nos passos seguintes.
    accessToken = body.accessToken;
    refreshCookie = rotated;
  });

  it('3. criar tarefa: POST /api/tasks retorna PENDING', async () => {
    const res = await request(server)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ description: TASK_DESCRIPTION })
      .expect(201);

    const body = res.body as CreatedTask;
    expect(body.status).toBe('PENDING');
    expect(typeof body.taskId).toBe('string');
    taskId = body.taskId;
  });

  it('4. stream SSE dispara a geração e emite eventos nomeados', async () => {
    const raw = await consumeStream(e2e.baseUrl, taskId, accessToken, 20_000);

    // Consumimos ao menos um evento nomeado do SSE (início do fluxo) e, no
    // caminho feliz com o FakeLlmProvider, o evento terminal de sucesso.
    expect(raw).toContain('event:');
    expect(raw).toContain('event: completed');
  });

  it('5. geração concluída: tarefa COMPLETED com specification', async () => {
    // Após o stream terminal, a persistência da conclusão é síncrona; um
    // polling curto absorve qualquer defasagem de transação.
    let detail: TaskDetailResponse | null = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      const res = await request(server)
        .get(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      detail = res.body as TaskDetailResponse;
      if (detail.status === 'COMPLETED') {
        break;
      }
      await sleep(250);
    }

    expect(detail?.status).toBe('COMPLETED');
    expect(detail?.specification).toBeTruthy();
    expect(typeof detail?.specification?.title).toBe('string');
    expect(Array.isArray(detail?.specification?.functionalRequirements)).toBe(true);
  });

  it('6. avaliação: job BullMQ persiste TaskEvaluation (polling curto)', async () => {
    // A avaliação (LLM-as-Judge) é assíncrona via BullMQ. Fazemos polling curto
    // do GET até o status virar COMPLETED (caminho feliz) ou UNAVAILABLE.
    let status: string | undefined;
    let body: TaskDetailResponse | undefined;
    for (let attempt = 0; attempt < 40; attempt++) {
      const res = await request(server)
        .get(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      body = res.body as TaskDetailResponse;
      status = body.evaluation?.status;
      if (status === 'COMPLETED' || status === 'UNAVAILABLE') {
        break;
      }
      await sleep(500);
    }

    expect(status === 'COMPLETED' || status === 'UNAVAILABLE').toBe(true);
    expect(body).toBeTruthy();
  });

  it('7. histórico: GET /api/tasks paginado lista a tarefa', async () => {
    const res = await request(server)
      .get('/api/tasks')
      .query({ page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = res.body as TaskListResponse;
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
    expect(body.total).toBeGreaterThanOrEqual(1);

    expect(body.items.some((item) => item.id === taskId)).toBe(true);
  });
});
