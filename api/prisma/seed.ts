import {
  PrismaClient,
  TaskStatus,
  GenerationRunStatus,
  EvaluationStatus,
  QualityGateResult,
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

// Especificação de demonstração no MESMO formato que o fluxo real persiste:
// JSON serializado de um TaskSpecification (contentFormat 'json'). O presenter
// faz JSON.parse do artifact; gravar Markdown aqui faria a tarefa COMPLETED
// aparecer sem especificação na API.
const SPEC_EXAMPLE = {
  title: 'Processamento assíncrono de pagamento no checkout',
  context:
    'A API de checkout processa pagamentos de forma síncrona, o que trava a resposta ao cliente quando o gateway está lento.',
  objective:
    'Tornar o processamento de pagamento assíncrono, retornando um identificador de transação imediatamente e notificando o cliente ao concluir.',
  functionalRequirements: [
    'Enfileirar o pagamento e retornar um transactionId imediatamente',
    'Processar o pagamento em um worker desacoplado da requisição',
    'Notificar o cliente do resultado via webhook ou permitir polling por status',
  ],
  nonFunctionalRequirements: [
    'O endpoint de checkout deve responder em menos de 300ms no caminho feliz',
    'Retentar falhas transitórias do gateway até 3 vezes com backoff exponencial',
  ],
  acceptanceCriteria: [
    'POST /checkout retorna 202 com um transactionId em menos de 300ms',
    'O processamento efetivo ocorre em um worker desacoplado',
    'O cliente é notificado do resultado via webhook ou polling',
    'Falhas no gateway são retentadas até 3 vezes com backoff',
  ],
  technicalTasks: [
    'Introduzir uma fila para desacoplar recebimento e processamento',
    'Criar um worker que consome a fila e chama o gateway',
    'Persistir o estado da transação (pending, succeeded, failed)',
    'Expor GET /checkout/:id para consulta de status',
    'Implementar notificação de conclusão',
  ],
  risks: [
    'Inconsistência se o worker falhar após cobrar o gateway',
    'Necessidade de idempotência na chamada ao gateway',
  ],
  dependencies: ['Infraestrutura de fila (Redis/RabbitMQ)'],
  definitionOfDone: [
    'Testes cobrindo enfileiramento, processamento e notificação',
    'Idempotência do gateway validada',
    'Documentação do novo fluxo de status atualizada',
  ],
} as const;

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

  const specContent = JSON.stringify(SPEC_EXAMPLE);
  await prisma.taskArtifact.upsert({
    where: { id: IDS.artifacts.completed },
    update: { content: specContent, contentFormat: 'json' },
    create: {
      id: IDS.artifacts.completed,
      taskId: IDS.tasks.completed,
      generationRunId: IDS.runs.completed,
      content: specContent,
      contentFormat: 'json',
    },
  });

  // Campos compartilhados entre create e update: o upsert precisa CONVERGIR ao
  // mesmo estado em reexecuções (idempotência real). Atualizar só o `status` no
  // update deixaria registros de seeds antigos com formato divergente.
  const completedEvaluation = {
    status: EvaluationStatus.COMPLETED,
    result: QualityGateResult.APPROVED,
    promptVersion: 'judge-v1',
    // 8.50 = média dos seis critérios abaixo (soma 51 / 6). Mantém coerência
    // entre a coluna `score` e o detalhamento em `dimensions.scores`.
    score: new Prisma.Decimal('8.50'),
    rationale:
      'A especificação está clara e bem estruturada. Os critérios de aceite são testáveis. Poderia detalhar melhor a estratégia de idempotência no gateway.',
    // Mesmo formato que o repositório persiste (saveEvaluationSuccess):
    // { scores: {<6 critérios>}, overallScore, reasons }. As chaves batem com
    // EVALUATION_CRITERIA para o presenter conseguir extrair os critérios.
    dimensions: {
      scores: {
        clarity: 9,
        completeness: 9,
        consistency: 8,
        testability: 9,
        risks: 7,
        requirementsAdherence: 9,
      },
      overallScore: 8.5,
      reasons: [
        'Critérios de aceite testáveis e bem definidos',
        'Poderia detalhar a estratégia de idempotência no gateway',
      ],
    } satisfies Prisma.InputJsonObject,
    model: DEMO_MODEL,
  } satisfies Prisma.TaskEvaluationUpdateInput;

  await prisma.taskEvaluation.upsert({
    where: { id: IDS.evaluations.completed },
    update: completedEvaluation,
    create: {
      id: IDS.evaluations.completed,
      taskId: IDS.tasks.completed,
      ...completedEvaluation,
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
