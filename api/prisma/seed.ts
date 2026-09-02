import {
  PrismaClient,
  TaskStatus,
  GenerationRunStatus,
  EvaluationStatus,
  LlmOperation,
  Prisma,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// UUIDs fixos garantem idempotência: reexecutar o seed atualiza os mesmos registros.
const IDS = {
  users: {
    ana: '00000000-0000-0000-0000-000000000001',
    bruno: '00000000-0000-0000-0000-000000000002',
  },
  tasks: {
    completed: '10000000-0000-0000-0000-000000000001',
    failed: '10000000-0000-0000-0000-000000000002',
    streaming: '10000000-0000-0000-0000-000000000003',
    pending: '10000000-0000-0000-0000-000000000004',
  },
  runs: {
    completed: '20000000-0000-0000-0000-000000000001',
    failed: '20000000-0000-0000-0000-000000000002',
    streaming: '20000000-0000-0000-0000-000000000003',
  },
  artifacts: {
    completed: '30000000-0000-0000-0000-000000000001',
  },
  evaluations: {
    completed: '40000000-0000-0000-0000-000000000001',
  },
} as const;

const DEMO_MODEL = 'HuggingFaceH4/zephyr-7b-beta';

const SPEC_EXAMPLE = `## Contexto
A API de checkout processa pagamentos de forma síncrona, o que trava a resposta ao cliente quando o gateway está lento.

## Objetivo
Tornar o processamento de pagamento assíncrono, retornando um identificador de transação imediatamente e notificando o cliente ao concluir.

## Critérios de aceite
- [ ] O endpoint POST /checkout retorna 202 com um transactionId em menos de 300ms
- [ ] O processamento efetivo ocorre em um worker desacoplado
- [ ] O cliente é notificado do resultado via webhook ou polling
- [ ] Falhas no gateway são retentadas até 3 vezes com backoff

## Passos de implementação
1. Introduzir uma fila para desacoplar recebimento e processamento
2. Criar um worker que consome a fila e chama o gateway
3. Persistir o estado da transação (pending, succeeded, failed)
4. Expor GET /checkout/:id para consulta de status
5. Implementar notificação de conclusão

## Riscos e dependências
- Dependência de infraestrutura de fila (Redis/RabbitMQ)
- Risco de inconsistência se o worker falhar após cobrar o gateway
- Necessário idempotência na chamada ao gateway

## Estimativa de esforço
média — requer nova infraestrutura de fila e tratamento de estados`;

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash('DemoPass123!', 12);

  // ── Usuários ────────────────────────────────────────────────────────────────
  const ana = await prisma.user.upsert({
    where: { id: IDS.users.ana },
    update: { displayName: 'Ana Arquiteta', passwordHash },
    create: {
      id: IDS.users.ana,
      email: 'ana@example.com',
      displayName: 'Ana Arquiteta',
      passwordHash,
    },
  });

  await prisma.user.upsert({
    where: { id: IDS.users.bruno },
    update: { displayName: 'Bruno Dev', passwordHash },
    create: {
      id: IDS.users.bruno,
      email: 'bruno@example.com',
      displayName: 'Bruno Dev',
      passwordHash,
    },
  });

  // ── Tarefa COMPLETED (com run, artifact, evaluation e usage) ─────────────────
  await prisma.task.upsert({
    where: { id: IDS.tasks.completed },
    update: { status: TaskStatus.COMPLETED },
    create: {
      id: IDS.tasks.completed,
      userId: ana.id,
      description:
        'Preciso tornar o processamento de pagamento do checkout assíncrono para não travar a resposta ao cliente quando o gateway está lento.',
      status: TaskStatus.COMPLETED,
    },
  });

  await prisma.taskGenerationRun.upsert({
    where: { id: IDS.runs.completed },
    update: { status: GenerationRunStatus.SUCCEEDED },
    create: {
      id: IDS.runs.completed,
      taskId: IDS.tasks.completed,
      status: GenerationRunStatus.SUCCEEDED,
      model: DEMO_MODEL,
      startedAt: new Date('2026-08-01T10:00:00Z'),
      finishedAt: new Date('2026-08-01T10:00:12Z'),
    },
  });

  await prisma.taskArtifact.upsert({
    where: { id: IDS.artifacts.completed },
    update: { content: SPEC_EXAMPLE },
    create: {
      id: IDS.artifacts.completed,
      taskId: IDS.tasks.completed,
      generationRunId: IDS.runs.completed,
      content: SPEC_EXAMPLE,
      contentFormat: 'markdown',
    },
  });

  await prisma.taskEvaluation.upsert({
    where: { id: IDS.evaluations.completed },
    update: { status: EvaluationStatus.COMPLETED },
    create: {
      id: IDS.evaluations.completed,
      taskId: IDS.tasks.completed,
      status: EvaluationStatus.COMPLETED,
      score: new Prisma.Decimal('8.40'),
      rationale:
        'A especificação está clara e bem estruturada. Os critérios de aceite são testáveis. Poderia detalhar melhor a estratégia de idempotência no gateway.',
      dimensions: {
        clarity: 9,
        completeness: 8,
        actionability: 9,
        risks: 7,
        formatting: 9,
      },
      model: DEMO_MODEL,
    },
  });

  // Consumo de tokens da geração e da avaliação
  await prisma.llmUsage.upsert({
    where: { id: 'a0000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: 'a0000000-0000-0000-0000-000000000001',
      operation: LlmOperation.GENERATION,
      model: DEMO_MODEL,
      promptTokens: 320,
      completionTokens: 540,
      totalTokens: 860,
      latencyMs: 11800,
      // Valor de exemplo plausível para a demo (Etapa 09). Em produção o custo é
      // calculado a partir das rates configuráveis; aqui usamos um literal fixo.
      estimatedCost: new Prisma.Decimal('0.001290'),
      generationRunId: IDS.runs.completed,
    },
  });

  await prisma.llmUsage.upsert({
    where: { id: 'a0000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: 'a0000000-0000-0000-0000-000000000002',
      operation: LlmOperation.EVALUATION,
      model: DEMO_MODEL,
      promptTokens: 610,
      completionTokens: 180,
      totalTokens: 790,
      latencyMs: 4200,
      // Valor de exemplo plausível para a demo (Etapa 09), coerente com o uso acima.
      estimatedCost: new Prisma.Decimal('0.001185'),
      evaluationId: IDS.evaluations.completed,
    },
  });

  // ── Tarefa FAILED (run com erro, sem artifact) ───────────────────────────────
  await prisma.task.upsert({
    where: { id: IDS.tasks.failed },
    update: { status: TaskStatus.FAILED },
    create: {
      id: IDS.tasks.failed,
      userId: ana.id,
      description:
        'Quero um sistema de recomendação de produtos baseado no histórico de navegação do usuário, com atualização em tempo real.',
      status: TaskStatus.FAILED,
    },
  });

  await prisma.taskGenerationRun.upsert({
    where: { id: IDS.runs.failed },
    update: { status: GenerationRunStatus.FAILED },
    create: {
      id: IDS.runs.failed,
      taskId: IDS.tasks.failed,
      status: GenerationRunStatus.FAILED,
      model: DEMO_MODEL,
      errorMessage: 'Timeout ao aguardar resposta do provider de LLM após 90s.',
      startedAt: new Date('2026-08-02T14:30:00Z'),
      finishedAt: new Date('2026-08-02T14:31:30Z'),
    },
  });

  // ── Tarefa STREAMING (run em andamento) ──────────────────────────────────────
  await prisma.task.upsert({
    where: { id: IDS.tasks.streaming },
    update: { status: TaskStatus.STREAMING },
    create: {
      id: IDS.tasks.streaming,
      userId: IDS.users.bruno,
      description:
        'Preciso adicionar autenticação de dois fatores (2FA) via TOTP ao fluxo de login existente.',
      status: TaskStatus.STREAMING,
    },
  });

  await prisma.taskGenerationRun.upsert({
    where: { id: IDS.runs.streaming },
    update: { status: GenerationRunStatus.RUNNING },
    create: {
      id: IDS.runs.streaming,
      taskId: IDS.tasks.streaming,
      status: GenerationRunStatus.RUNNING,
      model: DEMO_MODEL,
      startedAt: new Date('2026-08-03T09:15:00Z'),
    },
  });

  // ── Tarefa PENDING (sem run ainda) ───────────────────────────────────────────
  await prisma.task.upsert({
    where: { id: IDS.tasks.pending },
    update: { status: TaskStatus.PENDING },
    create: {
      id: IDS.tasks.pending,
      userId: IDS.users.bruno,
      description:
        'Gostaria de migrar os logs da aplicação para um formato estruturado em JSON e enviá-los para um coletor central.',
      status: TaskStatus.PENDING,
    },
  });

  console.log('Seed concluído com sucesso.');
  console.log('Usuários de demonstração: ana@example.com / bruno@example.com (senha: DemoPass123!)');
}

main()
  .catch((error: unknown) => {
    console.error('Falha no seed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
