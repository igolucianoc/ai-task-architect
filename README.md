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

## Executando com Docker (um comando)

Sobe PostgreSQL, Redis, API e Web:

```bash
docker compose up --build
```

Isso é tudo. A ordem de inicialização é garantida por _healthchecks_ (a API só sobe
depois que o Postgres e o Redis estão saudáveis; o Web só depois que a API está
saudável), e no primeiro boot a API aplica as migrations e executa o seed de
demonstração automaticamente — não há passo manual entre os containers.

- API: http://localhost:3000/api
- Web: http://localhost:5173
- Health check: http://localhost:3000/api/health

> Sem um `HF_TOKEN` real (o valor placeholder é o padrão), a API usa um provider de
> LLM _fake_ que devolve uma especificação de exemplo. Assim a aplicação sobe e
> funciona ponta a ponta sem nenhuma chamada externa.

### Atalhos (Makefile)

Há um `Makefile` com atalhos para o dia a dia (rode `make help` para a lista completa):

```bash
make up            # docker compose up --build
make up-detached   # sobe em background
make logs          # acompanha os logs
make ps            # estado e healthchecks dos serviços
make seed          # reexecuta o seed idempotente
make check         # lint + typecheck + testes da API
make down          # para os containers (mantém o banco)
make down-clean    # para e APAGA os volumes (reset total do banco)
```

### Controle da inicialização do banco

O boot da API aplica migrations e roda o seed por padrão. Para pular qualquer um
deles, defina as variáveis no ambiente antes do `up` (ou no `.env` da raiz):

| Variável | Padrão | Efeito quando `false` |
|----------|--------|-----------------------|
| `RUN_MIGRATIONS` | `true` | não aplica `prisma migrate deploy` no boot |
| `RUN_DB_SEED` | `true` | não executa o seed de demonstração no boot |

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

## Troubleshooting

**A API reinicia em loop / fica _unhealthy_.**
Veja os logs com `docker compose logs -f api`. As causas mais comuns são migrations
que falham (banco antigo com esquema incompatível) ou `JWT_SECRET` com menos de 32
caracteres. Para um banco de desenvolvimento, `make down-clean` apaga os volumes e
recomeça do zero.

**Porta já em uso (`address already in use`).**
Alguma das portas 3000, 5173, 5432 ou 6379 já está ocupada no host. Ajuste
`API_PORT`, `WEB_PORT`, `POSTGRES_PORT` ou `REDIS_PORT` no `.env` da raiz e suba
novamente.

**`Cannot find module '@prisma/client'` ou erro de engine do Prisma.**
O Prisma Client é gerado durante o build da imagem. Após alterar `schema.prisma`,
reconstrua com `docker compose build api` (ou `make build`).

**O seed não populou os dados.**
O seed é idempotente e roda no boot. Reexecute manualmente com `make seed` (ou
`docker compose exec api npm run db:seed`). Se estiver em imagem de produção enxuta
e o seed for indisponível, o boot segue sem os dados de demonstração — isso é
esperado e não derruba a API.

**Migrations não aplicaram / quero pular o seed.**
Controle pelas variáveis `RUN_MIGRATIONS` e `RUN_DB_SEED` (ver acima).

**Mudei o `docker-compose.yml` ou os healthchecks e nada mudou.**
Recrie os containers: `docker compose up --build --force-recreate`.

## Segurança

- Token da Hugging Face lido apenas de variável de ambiente; nunca é registrado em logs.
- Senhas com bcrypt; refresh token armazenado como hash, com rotação e detecção de reuso.
- Rate limiting nas rotas de autenticação; Helmet e CORS restrito.
- A saída do LLM é tratada como não confiável: validada por schema antes de qualquer persistência.

## Documentação

Decisões de arquitetura estão registradas como ADRs em [`docs/adr/`](docs/adr/). Visão de produto,
modelo de domínio e visão geral da arquitetura estão em [`docs/`](docs/).
