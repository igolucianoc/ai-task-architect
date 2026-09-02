# AI Task Architect

Aplicação fullstack que transforma uma necessidade técnica descrita em linguagem natural em uma
especificação de implementação estruturada, gerada por um LLM e validada antes de ser persistida.

A partir de um texto como _"adicionar autenticação com Google mantendo controle de permissões por
tenant"_, a aplicação produz uma especificação com título, contexto, objetivo, requisitos
funcionais e não funcionais, critérios de aceite, tarefas técnicas, riscos, dependências e
Definition of Done.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | NestJS + TypeScript (strict) |
| Frontend | Vue 3 + TypeScript + Vite |
| Banco de dados | PostgreSQL + Prisma |
| Cache / filas | Redis + BullMQ |
| Streaming | Server-Sent Events (SSE) |
| LLM | Hugging Face (`@huggingface/inference`) |
| Validação | Zod |
| Testes | Vitest |
| Infra local | Docker Compose |

## Estrutura do repositório

```
ai-task-architect/
├── api/                 # API NestJS
│   ├── src/
│   │   ├── modules/     # módulos de feature, cada um com camadas:
│   │   │   ├── tasks/   #   application / infrastructure / presentation / schemas
│   │   │   ├── auth/    #   autenticação JWT (access + refresh)
│   │   │   ├── users/   #   repositório de usuários
│   │   │   └── health/  #   health check
│   │   ├── config/      # configuração validada (Zod)
│   │   ├── common/      # pipes, filtros, throttler (transversais)
│   │   └── prisma/      # PrismaService/PrismaModule
│   └── prisma/          # schema, migrations e seed
├── web/                 # SPA Vue 3
├── docs/                # documentação de arquitetura e ADRs
└── docker-compose.yml   # PostgreSQL, Redis, API e Web
```

O módulo `tasks` segue arquitetura hexagonal: o domínio depende de uma porta `LlmProvider` e nunca
do SDK concreto. Ver [`docs/adr/009-task-generation-hexagonal.md`](docs/adr/009-task-generation-hexagonal.md).

## Pré-requisitos

- Node.js 24+
- Docker e Docker Compose
- Um token de acesso da Hugging Face (opcional para desenvolvimento — veja abaixo)

## Configuração

A API lê a configuração de variáveis de ambiente validadas na inicialização (Zod). Copie o exemplo
e ajuste os valores:

```bash
cp api/.env.example api/.env
```

Variáveis relevantes (`api/.env`):

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | conexão PostgreSQL |
| `REDIS_URL` | conexão Redis |
| `JWT_SECRET` | segredo de assinatura do JWT (mín. 32 caracteres) |
| `HF_TOKEN` | token da Hugging Face (obtenha em https://huggingface.co/settings/tokens) |
| `HF_MODEL` | modelo de inferência (padrão: `HuggingFaceH4/zephyr-7b-beta`) |

Sem um `HF_TOKEN` real (valor placeholder), a API usa um provider de LLM _fake_ que devolve uma
especificação de exemplo — útil para rodar e demonstrar a aplicação offline, sem chamadas externas.

## Executando com Docker

Sobe PostgreSQL, Redis, API e Web:

```bash
docker compose up --build
```

- API: http://localhost:3000/api
- Web: http://localhost:5173
- Health check: http://localhost:3000/api/health

## Executando localmente (sem Docker para a aplicação)

Suba apenas a infraestrutura e rode API e Web pela CLI:

```bash
# infraestrutura
docker compose up -d postgres redis

# API
cd api
npm install
npx prisma migrate deploy   # aplica as migrations
npm run db:seed             # (opcional) dados de demonstração
npm run start:dev

# Web (em outro terminal)
cd web
npm install
npm run dev
```

## Endpoints principais

Autenticação (`/api/auth`):

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/register` | cria conta, retorna access token e cookie de refresh |
| POST | `/login` | autentica |
| POST | `/refresh` | renova o access token (rotação de refresh) |
| POST | `/logout` | revoga a sessão |
| GET | `/me` | dados do usuário autenticado |

Tarefas (`/api/tasks`, exigem JWT):

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/` | gera uma especificação a partir de uma descrição (50–2000 caracteres) |
| GET | `/` | lista paginada das tarefas do usuário |
| GET | `/:id` | detalhe de uma tarefa, com a especificação e a última execução |

## Testes e qualidade

Na pasta `api/` (e analogamente em `web/`):

```bash
npm test          # testes unitários (Vitest)
npm run typecheck # verificação de tipos
npm run lint      # ESLint (TypeScript strict, sem any)
```

## Segurança

- Token da Hugging Face lido apenas de variável de ambiente; nunca é registrado em logs.
- Senhas com bcrypt; refresh token armazenado como hash, com rotação e detecção de reuso.
- Rate limiting nas rotas de autenticação; Helmet e CORS restrito.
- A saída do LLM é tratada como não confiável: validada por schema antes de qualquer persistência.

## Documentação

Decisões de arquitetura estão registradas como ADRs em [`docs/adr/`](docs/adr/). Visão de produto,
modelo de domínio e visão geral da arquitetura estão em [`docs/`](docs/).
