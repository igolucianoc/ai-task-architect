import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { LLM_PROVIDER } from '../src/modules/tasks/application/llm-provider.port';
import { FakeLlmProvider } from '../src/modules/tasks/infrastructure/fake-llm.provider';

/**
 * Handle da app E2E: a instância Nest, o PrismaService e o FakeLlmProvider
 * usado no override. Expor o Fake permite, se necessário, customizar respostas
 * por teste (setResponse/simulateFailure) sem tocar no container.
 */
export interface E2EApp {
  app: INestApplication;
  prisma: PrismaService;
  llm: FakeLlmProvider;
  /** URL base (ex.: http://127.0.0.1:PORTA) — a app escuta numa porta efêmera. */
  baseUrl: string;
}

/**
 * Sobe a app Nest real a partir do AppModule, sobrescrevendo o token de LLM
 * (LLM_PROVIDER) por um FakeLlmProvider — assim nenhum teste chama o provider
 * real. Aplica a mesma configuração de runtime do main.ts (prefixo /api,
 * cookie-parser e helmet) para que os endpoints se comportem como em produção.
 *
 * Requer Postgres e Redis no ar (via `docker compose up -d postgres redis`),
 * pois usa PrismaService e BullMQ reais.
 */
export async function createE2EApp(): Promise<E2EApp> {
  // Garante o provider fake e ambiente de teste antes de o AppModule carregar a
  // config. O override abaixo é a fonte da verdade, mas manter NODE_ENV=test
  // evita qualquer chamada de rede caso a factory seja avaliada.
  process.env.NODE_ENV = 'test';

  const fakeLlm = new FakeLlmProvider();

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(LLM_PROVIDER)
    .useValue(fakeLlm)
    .compile();

  const app = moduleRef.createNestApplication();

  // Mesmo setup do bootstrap real (main.ts).
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());

  // Escuta numa porta efêmera: alguns fluxos (SSE) usam `fetch` real, que
  // precisa de um servidor HTTP de verdade — não só o handle do supertest.
  await app.listen(0);
  const url = await app.getUrl();
  // getUrl() pode devolver o host `::1` (IPv6) que trava fetch em alguns
  // ambientes; normalizamos para 127.0.0.1.
  const baseUrl = url.replace('[::1]', '127.0.0.1').replace('localhost', '127.0.0.1');

  const prisma = app.get(PrismaService);

  return { app, prisma, llm: fakeLlm, baseUrl };
}

/**
 * Limpa as tabelas de domínio afetadas pelos fluxos E2E. O TRUNCATE ... CASCADE
 * remove filhos (runs, artifacts, avaliações, usos de LLM e sessões de refresh)
 * de uma vez, deixando o banco em estado previsível a cada execução.
 *
 * Os nomes usados são os das tabelas no Postgres (@@map do schema.prisma).
 */
export async function cleanDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE ' +
      '"llm_usages", ' +
      '"task_artifacts", ' +
      '"task_generation_runs", ' +
      '"task_evaluations", ' +
      '"tasks", ' +
      '"refresh_sessions", ' +
      '"users" ' +
      'RESTART IDENTITY CASCADE',
  );
}

/**
 * Encerra a app e as conexões externas (Prisma, Redis do BullMQ e do throttler)
 * para o processo de teste não travar após o fim da suíte. `app.close()` aciona
 * os hooks onModuleDestroy (Prisma desconecta) e finaliza os módulos BullMQ.
 */
export async function closeE2EApp(handle: E2EApp): Promise<void> {
  await handle.app.close();
}
