# Arquitetura — AI Task Architect

## Contexto arquitetural

O sistema é uma aplicação web de complexidade média, adequada para portfólio. A arquitetura deve
ser simples o suficiente para ser compreendida em uma leitura, mas completa o suficiente para
demonstrar decisões de engenharia reais.

**Princípio guia:** clareza sobre sofisticação. Cada camada existe porque tem responsabilidade
própria, não para impressionar.

---

## Visão geral do sistema

```
┌─────────────────────────────────────────────────────┐
│                     Cliente (Vue 3)                  │
│   Auth  │  Task Form  │  SSE Stream  │  History     │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS / SSE
┌──────────────────────▼──────────────────────────────┐
│                  API (NestJS)                        │
│                                                      │
│  AuthModule  │  TaskModule  │  EvaluationModule     │
│                                                      │
│  Guards/Rate Limiting  │  Pipes/Validation (Zod)    │
└──────┬──────────────────────────────────┬───────────┘
       │                                  │
┌──────▼──────┐                  ┌────────▼──────────┐
│  PostgreSQL │                  │  Redis + BullMQ   │
│  (Prisma)   │                  │  (jobs assíncronos)│
└─────────────┘                  └────────┬──────────┘
                                          │
                                 ┌────────▼──────────┐
                                 │  Hugging Face API  │
                                 │  (geração + judge) │
                                 └───────────────────┘
```

---

## Organização de pastas (Clean Architecture + Vertical Slices)

A API adota Clean Architecture com _vertical slices_ por módulo de negócio, com `core/` e `infra/`
transversais. A regra de dependência aponta para dentro: `presentation → application → domain`, e a
camada `persistence` implementa as interfaces de repositório definidas no `domain`. O `domain` não
depende de framework.

```
src/
├── core/                       # transversais de núcleo
│   ├── config/                 # app.config (validado por Zod no boot)
│   └── observability/          # app-logger, constants, observability.module
├── infra/                      # transversais de infraestrutura
│   ├── app.module.ts           # composição raiz
│   ├── main.ts                 # bootstrap (entryFile → dist/infra/main)
│   ├── database/prisma/        # PrismaService + PrismaModule
│   └── http/                   # pipes (Zod), filtros, interceptors, throttler
└── modules/<domínio>/
    ├── application/            # use-cases + services
    ├── domain/                 # entities, errors, interfaces de repositório (I{Entity}Repository)
    ├── persistence/            # mappers + Prisma{Entity}Repository + InMemory{Entity}Repository
    └── presentation/           # controllers, presenters, http/, schemas (Zod)
```

Cada repositório tem uma interface no `domain` (`I{Entity}Repository`) com um token de injeção
(`Symbol`), implementada por um `Prisma{Entity}Repository` (produção) e um
`InMemory{Entity}Repository` (testes/offline). Os módulos Nest ligam o token à implementação Prisma
via `{ provide: TOKEN, useClass: Prisma... }`.

---

## Módulos da API

### AuthModule
Responsabilidade: registro, login, refresh de token, logout.

- `POST /auth/register` — cria usuário, retorna tokens
- `POST /auth/login` — autentica, retorna tokens
- `POST /auth/refresh` — renova access token via refresh token (cookie HttpOnly)
- `POST /auth/logout` — revoga refresh token

Dependências internas: `UsersModule` (repositório de usuários).

---

### TaskModule
Responsabilidade: receber input do usuário, orquestrar geração via LLM, transmitir resultado via SSE,
persistir tarefa.

- `POST /tasks` — inicia geração, retorna `taskId`
- `GET /tasks/:id/stream` — endpoint SSE, transmite o resultado em tempo real
- `GET /tasks` — lista tarefas do usuário (paginado)
- `GET /tasks/:id` — detalhe de uma tarefa

Dependências internas: `LlmModule`, `EvaluationModule` (dispara job), `PrismaService`.

---

### EvaluationModule
Responsabilidade: processar avaliação de qualidade de uma especificação via LLM Judge.

Não expõe rotas HTTP externas. É acionado internamente pelo `TaskModule` via job BullMQ após
conclusão da geração.

Dependências internas: `LlmModule`, `PrismaService`.

---

### LlmModule
Responsabilidade: abstrair a comunicação com o provider de LLM (Hugging Face).

Expõe dois métodos principais:
- `generate(prompt, options): AsyncIterable<string>` — geração com streaming
- `evaluate(prompt, options): Promise<string>` — avaliação sem streaming

Provider: exclusivamente Hugging Face (Inference API). Nenhum outro provider.

---

### UsersModule
Responsabilidade: CRUD de usuários, repositório de dados de autenticação.

Interno — não expõe rotas públicas diretamente (apenas via `AuthModule`).

---

## Fluxo de geração de tarefa

```
1. Cliente → POST /tasks { description }
2. API valida input (Zod), cria registro Task com status=pending, retorna { taskId }
3. Cliente abre GET /tasks/:id/stream (SSE)
4. TaskService aciona LlmService.generate(prompt)
5. Tokens chegam via AsyncIterable → escritos no SSE chunk a chunk
6. Ao finalizar: Task atualizada para status=completed, content=saída completa
7. TaskService enfileira job EvaluationJob no BullMQ
8. EvaluationWorker processa: LlmService.evaluate(content) → score + justificativa
9. Task atualizada com evaluation { score, rationale, evaluatedAt }
10. Cliente pode consultar GET /tasks/:id para ver a avaliação completa
```

---

## Fluxo de avaliação (LLM Judge)

```
1. Job recebe { taskId, content }
2. Constrói prompt de avaliação com critérios fixos (rubrica)
3. Chama LlmService.evaluate() — sem streaming, resposta completa
4. Faz parse do JSON retornado: { score: number, rationale: string }
5. Persiste em EvaluationResult vinculado à Task
6. Em caso de falha: salva status=unavailable, não propaga erro para o usuário
```

---

## Estratégia de persistência

**PostgreSQL via Prisma ORM.**

Justificativa: dados relacionais (usuário → tarefas → avaliações), necessidade de transações e
queries tipadas. Prisma oferece migrações versionadas e tipo gerado automaticamente, reduzindo
boilerplate.

Não usar Redis como banco primário. Redis é exclusivo para cache de sessão (refresh tokens) e
filas BullMQ.

---

## Estratégia de SSE

O endpoint `GET /tasks/:id/stream` é um EventSource padrão.

- O NestJS usa `@Sse()` com `Observable<MessageEvent>` ou `AsyncGenerator`.
- O frontend usa a API nativa `EventSource` ou `fetch` com `ReadableStream`.
- Cada chunk do LLM é emitido como um evento SSE individual.
- Um evento final `[DONE]` sinaliza encerramento.
- Timeout de 90 segundos na conexão SSE para evitar conexões zumbi.

---

## Estratégia de jobs assíncronos

**BullMQ + Redis.**

Usado exclusivamente para a etapa de avaliação (LLM Judge), que não precisa bloquear a resposta
principal ao usuário.

Filas:
- `evaluation` — processa avaliações de qualidade após geração

Configuração mínima: 1 worker, sem concorrência paralela excessiva (respeitar rate limits do HF).
Retentativas: até 3 com backoff exponencial.

---

## Estratégia de autenticação

**JWT com access token + refresh token.**

- Access token: JWT assinado, TTL de 15 minutos, enviado no header `Authorization: Bearer`.
- Refresh token: UUID opaco, TTL de 7 dias, armazenado em cookie HttpOnly/Secure/SameSite=Strict.
- Refresh tokens são persistidos em banco (tabela `refresh_tokens`) para permitir revogação.
- Logout invalida o refresh token no banco.
- Rate limiting nas rotas `/auth/login` e `/auth/register`: máx. 5 req/min por IP.

---

## Estratégia de testes

| Camada | Tipo | Ferramenta |
|--------|------|------------|
| Services/use-cases | Unitário | Vitest + mocks manuais |
| Integração com banco | Integração | Vitest + banco de teste isolado |
| API ponta a ponta | E2E | Vitest + supertest |
| Frontend (componentes críticos) | Unitário | Vitest + @vue/test-utils |

Cobertura mínima esperada: serviços core (TaskService, EvaluationService, AuthService) com > 80%.

---

## Riscos e trade-offs

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Latência alta do Hugging Face Inference API | Alta | Alto | Timeout configurável, mensagem de erro clara, status `failed` na tarefa |
| Resposta do LLM Judge mal formatada (não-JSON) | Média | Médio | Parser robusto com fallback para `unavailable` |
| Refresh token roubado via XSS | Baixa | Alto | Cookie HttpOnly impede acesso via JS |
| Conexão SSE abandonada sem cleanup | Média | Médio | Timeout + onClose handler que cancela o AsyncIterable |
| Over-engineering (módulos desnecessários) | Baixa | Médio | Revisar após cada etapa; remover abstração que não ganhou razão |

---

## Limites de escopo (o que este projeto não é)

- Não é um sistema multi-tenant com isolamento por organização.
- Não tem billing ou planos de acesso.
- Não tem interface de admin.
- Não tem notificações push ou e-mail.
- Não tem versionamento de especificações.
- Não tem colaboração em tempo real.

Essas ausências são intencionais. O projeto demonstra profundidade em um domínio restrito,
não largura de features.
