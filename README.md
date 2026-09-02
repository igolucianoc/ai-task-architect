# AI Task Architect

> Transforma uma necessidade técnica descrita em linguagem natural em uma especificação de
> implementação estruturada — gerada por um LLM, **validada por um segundo LLM que atua como juiz**
> e persistida somente depois de passar por um _quality gate_.

A partir de um texto como _"adicionar autenticação com Google mantendo controle de permissões por
tenant"_, a aplicação produz uma especificação com título, contexto, objetivo, requisitos
funcionais e não funcionais, critérios de aceite, tarefas técnicas, riscos, dependências e
Definition of Done. O progresso é transmitido em tempo real via streaming, e cada especificação
recebe uma nota de qualidade com justificativa por critério.

---

## Índice

- [O problema](#o-problema)
- [A solução](#a-solução)
- [Por que este projeto existe](#por-que-este-projeto-existe)
- [O que ele demonstra](#o-que-ele-demonstra)
- [Arquitetura](#arquitetura)
- [Stack](#stack)
- [Fluxo de geração](#fluxo-de-geração)
- [Fluxo de avaliação (LLM-as-Judge)](#fluxo-de-avaliação-llm-as-judge)
- [Streaming em tempo real (SSE)](#streaming-em-tempo-real-sse)
- [Autenticação](#autenticação)
- [Segurança](#segurança)
- [Observabilidade](#observabilidade)
- [Testes e qualidade](#testes-e-qualidade)
- [Como executar](#como-executar)
- [Dados de demonstração (seed)](#dados-de-demonstração-seed)
- [Endpoints principais](#endpoints-principais)
- [Decisões de arquitetura](#decisões-de-arquitetura)
- [Limitações conhecidas](#limitações-conhecidas)
- [Próximos passos](#próximos-passos)
- [Trajetória profissional por trás do projeto](#trajetória-profissional-por-trás-do-projeto)
- [Desenvolvimento assistido por IA](#desenvolvimento-assistido-por-ia)

---

## O problema

Escrever uma boa especificação técnica é caro e inconsistente. Times gastam tempo transformando
uma ideia solta em algo acionável — e o resultado varia conforme quem escreve. Ferramentas de LLM
ajudam a rascunhar, mas trazem um risco novo: elas produzem texto plausível que nem sempre é
completo, coerente ou aderente ao que foi pedido. Confiar cegamente na saída de um modelo apenas
troca um problema (esforço manual) por outro (qualidade não verificada).

## A solução

O AI Task Architect gera a especificação **e a submete a uma verificação automática antes de
entregá-la**. Um segundo LLM, isolado do contexto de geração, avalia a especificação em seis
critérios objetivos (clareza, completude, consistência, testabilidade, tratamento de riscos e
aderência aos requisitos) e um _quality gate_ determinístico decide se ela é aprovada ou reprovada.
A saída do modelo é sempre tratada como não confiável: é validada por schema antes de qualquer
persistência.

O resultado é um fluxo onde a IA acelera a produção **sem abrir mão de um mecanismo de controle de
qualidade** — o mesmo princípio de "não faça deploy sem testes" aplicado a conteúdo gerado por LLM.

## Por que este projeto existe

Este é um projeto de portfólio construído para demonstrar, ponta a ponta, como levar uma
funcionalidade baseada em LLM da ideia à produção com padrões de engenharia de verdade:
arquitetura em camadas, tipagem estrita, streaming, filas, autenticação, segurança, observabilidade
e testes. O objetivo não foi "usar IA", e sim **tratar a IA como um componente de sistema** — com
uma fronteira clara, validação de saída e avaliação de qualidade — dentro de uma aplicação fullstack
que roda com um único comando.

## O que ele demonstra

- **Integração de LLM com fronteira arquitetural**: o domínio depende de uma porta (`LlmProvider`),
  nunca do SDK concreto. Trocar o provedor não toca a regra de negócio.
- **LLM-as-Judge + quality gate**: avaliação automática e determinística da saída gerada.
- **Saída de LLM como dado não confiável**: parsing defensivo e validação por schema (Zod) antes de
  persistir.
- **Streaming de progresso** via Server-Sent Events, com reconexão controlada e reemissão de estado.
- **Processamento assíncrono** com Redis + BullMQ (a avaliação roda fora do request), com
  idempotência e retry.
- **Autenticação robusta**: JWT de acesso + refresh token opaco hasheado, com rotação e detecção de
  reuso.
- **Developer Experience**: `docker compose up --build` sobe tudo, com migrations e seed automáticos.
- **Qualidade de engenharia**: TypeScript strict sem `any` em produção, testes em API e frontend,
  observabilidade estruturada e decisões documentadas em ADRs.

## Arquitetura

Monorepo com dois aplicativos (`api/` e `web/`) e infraestrutura declarada em Docker Compose. A API
segue Clean Architecture com _vertical slices_ por módulo de negócio: cada módulo é organizado em
`domain` (entities, regras e interfaces de repositório), `application` (casos de uso e serviços),
`persistence` (mappers + repositórios Prisma/InMemory) e `presentation` (controllers, presenters,
schemas Zod). Transversais ficam em `core/` (config, observabilidade) e `infra/` (Prisma, HTTP,
bootstrap).

```
ai-task-architect/
├── api/                 # API NestJS
│   ├── src/
│   │   ├── core/        #   config + observabilidade (transversais de núcleo)
│   │   ├── infra/       #   database/prisma, http (pipes/filtros), app.module, main
│   │   └── modules/
│   │       ├── tasks/   #     geração + avaliação (domain / application / persistence / presentation / infra)
│   │       ├── auth/    #     autenticação JWT (access + refresh)
│   │       ├── users/   #     repositório de usuários
│   │       └── health/  #     health check
│   └── prisma/          # schema, migrations e seed
├── web/                 # SPA Vue 3 (views / components / composables / stores / services)
├── docs/                # visão, arquitetura, modelo de domínio e ADRs
└── docker-compose.yml   # PostgreSQL, Redis, API e Web
```

O ponto central é a **inversão de dependência na fronteira do LLM**: o domínio de `tasks` conhece
apenas a interface `LlmProvider`. A implementação Hugging Face vive em `infrastructure`, e um
provider _fake_ permite rodar tudo offline. Ver
[`docs/adr/009-task-generation-hexagonal.md`](docs/adr/009-task-generation-hexagonal.md) e a visão
geral em [`docs/architecture.md`](docs/architecture.md).

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

## Fluxo de geração

1. `POST /api/tasks` cria a tarefa com status `PENDING` (a descrição precisa ter 50–2000 caracteres)
   e responde com o `id`. A geração ainda **não** aconteceu.
2. O cliente abre o stream `GET /api/tasks/:id/stream`. Para uma tarefa `PENDING`, a assinatura do
   stream **dispara** a geração.
3. O caso de uso monta o prompt, chama o `LlmProvider` e emite marcos de progresso (`analyzing_context`,
   `generating_requirements`, ...) enquanto trabalha.
4. A resposta do modelo é extraída de forma defensiva (lida com cercas markdown e texto ao redor) e
   **validada contra um schema Zod**. Se falhar, a run é marcada como `FAILED` e nenhum artefato é
   gravado — não se persiste especificação inválida.
5. Em caso de sucesso, a especificação é persistida como JSON (`TaskArtifact`), a tarefa vira
   `COMPLETED` e o consumo de tokens/latência/custo é registrado para observabilidade.
6. A conclusão da geração enfileira o job de avaliação.

## Fluxo de avaliação (LLM-as-Judge)

A avaliação roda de forma **assíncrona**, num worker BullMQ, depois que o stream encerra — uma falha
do juiz nunca derruba a geração.

- O juiz recebe **apenas** a necessidade original e a especificação gerada; não reaproveita o
  contexto nem o prompt de geração, garantindo independência.
- Temperatura 0 para julgamento estável; a resposta é validada por schema (notas inteiras de 0 a 10
  por critério).
- O _quality gate_ é determinístico: reprova se a média ficar abaixo do limiar, se o critério
  crítico de aderência aos requisitos ficar abaixo do piso, ou se qualquer critério for zerado.
- O resultado (`APPROVED`/`REJECTED`), a nota geral, as notas por critério e as justificativas ficam
  disponíveis no detalhe da tarefa. Se o juiz falhar ou devolver algo não parseável, a avaliação é
  marcada como `UNAVAILABLE` em vez de quebrar.

Ver [`docs/adr/010-llm-judge-quality-gate.md`](docs/adr/010-llm-judge-quality-gate.md).

## Streaming em tempo real (SSE)

O progresso da geração é transmitido por Server-Sent Events. Escolhi SSE por ser unidirecional
(servidor → cliente), simples sobre HTTP e suficiente para o caso. Detalhes de implementação:

- Os eventos são bufferizados no servidor até o transporte assinar, então nenhum evento se perde no
  início do stream.
- Há timeout de stream; tarefas já concluídas ou falhas **reemitem** seu estado terminal ao serem
  reabertas, e uma tarefa em andamento sinaliza para não disparar uma geração concorrente.
- No cliente, um _composable_ encapsula o `EventSource`, desliga a reconexão automática do navegador
  após um evento terminal e limpa os listeners no unmount.

Como o `EventSource` nativo não envia header `Authorization`, a rota de stream autentica pelo access
token na query string. Ver [`docs/adr/005-sse-streaming.md`](docs/adr/005-sse-streaming.md).

## Autenticação

- **Access token** JWT de vida curta (15 min), enviado no header `Authorization`.
- **Refresh token opaco** (não-JWT), entregue em cookie `httpOnly`/`SameSite=strict`. Apenas o hash
  SHA-256 é persistido; o valor em claro nunca vai para o banco.
- **Rotação com detecção de reuso**: reapresentar um refresh token já revogado revoga todas as
  sessões ativas do usuário.
- Senhas com bcrypt; o login executa uma comparação constante mesmo para e-mail inexistente
  (mitiga enumeração por _timing_).

Ver [`docs/adr/007-jwt-auth.md`](docs/adr/007-jwt-auth.md).

## Segurança

- Token da Hugging Face lido apenas de variável de ambiente; nunca registrado em logs.
- Refresh token armazenado como hash, com rotação e detecção de reuso.
- Rate limiting distribuído (Redis) nas rotas de autenticação; Helmet e CORS de origem única.
- Escopo por usuário em todas as leituras/escritas de tarefas (sem acesso a recursos de terceiros).
- **A saída do LLM é tratada como não confiável**: validada por schema antes de qualquer persistência.
- Parâmetros sensíveis (como o `token` do SSE) são mascarados nos logs e nas respostas de erro. Ver
  [`docs/adr/013-sanitizacao-de-token-em-logs.md`](docs/adr/013-sanitizacao-de-token-em-logs.md).

## Observabilidade

- Logger estruturado (uma linha JSON por evento), com **correlation id** propagado do request até o
  worker de avaliação via _async local storage_.
- Interceptor de HTTP registra método, rota, status e duração — sem body, headers ou segredos.
- Métricas de uso de LLM (tokens de prompt/conclusão, latência e custo estimado) são persistidas por
  operação e expostas no detalhe da tarefa.

Ver [`docs/adr/011-observability.md`](docs/adr/011-observability.md).

## Testes e qualidade

- **API**: testes unitários dos casos de uso, do quality gate, dos serviços de auth e da
  observabilidade, além de uma suíte **E2E** que cobre o ciclo de vida da tarefa (`api/test/`).
- **Web**: testes de páginas, componentes, stores e do composable de SSE.
- TypeScript **strict** nos dois lados, sem `any` em código de produção.

Na pasta `api/` (analogamente em `web/`):

```bash
npm test          # testes (Vitest)
npm run test:e2e  # testes E2E (apenas API)
npm run typecheck # verificação de tipos
npm run lint      # ESLint
```

## Como executar

Pré-requisitos: Docker + Docker Compose (e Node.js 24+ para rodar fora de containers).

### Um comando

```bash
docker compose up --build
```

A ordem de inicialização é garantida por _healthchecks_ (a API só sobe depois que Postgres e Redis
estão saudáveis; o Web só depois que a API está saudável), e no primeiro boot a API aplica as
migrations e roda o seed automaticamente — não há passo manual entre os containers.

- API: http://localhost:3000/api
- Web: http://localhost:5173
- Health check: http://localhost:3000/api/health

> **Funciona offline.** Sem um `HF_TOKEN` real (o placeholder é o padrão), a API usa um provider de
> LLM _fake_ que devolve uma especificação de exemplo. A aplicação sobe e funciona ponta a ponta sem
> nenhuma chamada externa. Para usar um modelo real, defina `HF_TOKEN` em `api/.env`
> (obtenha em https://huggingface.co/settings/tokens).

### Atalhos (Makefile)

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

### Localmente, sem Docker para a aplicação

```bash
# infraestrutura
docker compose up -d postgres redis

# API
cd api && npm install
npx prisma migrate deploy
npm run db:seed        # opcional
npm run start:dev

# Web (em outro terminal)
cd web && npm install && npm run dev
```

### Configuração

A API valida a configuração na inicialização (Zod). Copie o exemplo e ajuste:

```bash
cp api/.env.example api/.env
```

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | conexão PostgreSQL |
| `REDIS_URL` | conexão Redis |
| `JWT_SECRET` | segredo de assinatura do JWT (mín. 32 caracteres) |
| `HF_TOKEN` | token da Hugging Face (opcional; sem ele, usa o provider fake) |
| `HF_MODEL` | modelo de inferência (padrão: `HuggingFaceH4/zephyr-7b-beta`) |
| `RUN_MIGRATIONS` / `RUN_DB_SEED` | controlam a inicialização automática do banco no boot |

### Troubleshooting

- **API em loop / _unhealthy_**: `docker compose logs -f api`. Costuma ser migration incompatível
  (use `make down-clean` para resetar o banco de dev) ou `JWT_SECRET` com menos de 32 caracteres.
- **Porta em uso**: ajuste `API_PORT`, `WEB_PORT`, `POSTGRES_PORT` ou `REDIS_PORT` no `.env` da raiz.
- **`Cannot find module '@prisma/client'`**: reconstrua a imagem após mudar o schema
  (`docker compose build api` ou `make build`).
- **Seed não populou**: `make seed`. É idempotente, pode reexecutar à vontade.
- **Nada mudou após editar o compose**: `docker compose up --build --force-recreate`.

## Dados de demonstração (seed)

O seed é **idempotente** (usa IDs fixos e _upserts_) e cria dois usuários de demonstração com
tarefas em vários estados — concluída (com especificação e avaliação aprovada), falha, em streaming
e pendente — para exercitar toda a UI sem precisar gerar nada.

- Usuários: `ana@example.com` e `bruno@example.com`
- Senha: `DemoPass123!`

> São credenciais de _fixture_ de desenvolvimento, não segredos de produção.

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
| POST | `/` | cria uma tarefa a partir de uma descrição (50–2000 caracteres) |
| GET | `/` | lista paginada das tarefas do usuário |
| GET | `/:id` | detalhe: especificação, avaliação e métricas de LLM |
| GET | `/:id/stream` | stream SSE de progresso da geração |
| DELETE | `/:id` | remove a tarefa do usuário |

## Decisões de arquitetura

As decisões relevantes estão registradas como ADRs em [`docs/adr/`](docs/adr/):

| ADR | Decisão |
|-----|---------|
| [001](docs/adr/001-monorepo-structure.md) | Estrutura de monorepo |
| [002](docs/adr/002-nestjs-backend.md) | NestJS no backend |
| [003](docs/adr/003-vue3-frontend.md) | Vue 3 no frontend |
| [004](docs/adr/004-huggingface-provider.md) | Hugging Face como provedor de LLM |
| [005](docs/adr/005-sse-streaming.md) | Streaming via SSE |
| [006](docs/adr/006-bullmq-jobs.md) | Jobs assíncronos com BullMQ |
| [007](docs/adr/007-jwt-auth.md) | Autenticação JWT (access + refresh) |
| [008](docs/adr/008-persistence-model-refinement.md) | Refinamento do modelo de persistência |
| [009](docs/adr/009-task-generation-hexagonal.md) | Geração de tarefas em arquitetura hexagonal |
| [010](docs/adr/010-llm-judge-quality-gate.md) | LLM-as-Judge e quality gate |
| [011](docs/adr/011-observability.md) | Observabilidade |
| [012](docs/adr/012-developer-experience-boot.md) | Execução com um comando (boot automático) |
| [013](docs/adr/013-sanitizacao-de-token-em-logs.md) | Sanitização de token em logs |

## Limitações conhecidas

- A chamada ao provedor de LLM não é cancelável: se o cliente desconecta durante o stream, o
  transporte encerra, mas a chamada em andamento segue até concluir e o resultado é persistido.
- O access token do SSE trafega na query string (limitação do `EventSource`). É mascarado nos logs
  da aplicação, mas logs de borda (proxy/CDN) ainda poderiam registrá-lo.
- O provider _fake_ retorna uma especificação de exemplo fixa; ele existe para demonstração offline,
  não para simular a variabilidade de um modelo real.
- Não há job de expurgo de sessões de refresh expiradas (a tabela cresce ao longo do tempo).

## Próximos passos

- Timeout/cancelamento real na chamada ao provedor via `AbortSignal`.
- Token de stream dedicado e de curta duração para o SSE, em vez do access token na URL.
- Modelo de avaliação dedicado (a variável já existe; o juiz hoje usa o mesmo provider da geração).
- Endpoint agregado de métricas de LLM para dashboards.
- Expurgo periódico de sessões de refresh.

## Trajetória profissional por trás do projeto

Este projeto conecta as etapas da minha evolução como engenheiro numa única aplicação:

- **Software Engineering** — a base: arquitetura em camadas, tipagem estrita, testes, tratamento de
  erros e uma API bem modelada.
- **Arquitetura** — separação de responsabilidades, inversão de dependência na fronteira do LLM,
  decisões registradas em ADRs e um modelo de domínio explícito.
- **Automação / DevEx** — infraestrutura como código com Docker Compose, boot determinístico com
  migrations e seed automáticos, e execução com um único comando.
- **LLM** — integração com um modelo tratando sua saída como entrada não confiável, com validação de
  schema e uma porta que isola o provedor do domínio.
- **Avaliação (LLM-as-Judge)** — o passo que diferencia o projeto: usar um segundo LLM, de forma
  independente e determinística, para medir a qualidade do que foi gerado.
- **AI Engineering** — amarrar tudo: streaming, filas, observabilidade de custo/latência e um
  _quality gate_ que decide o que é bom o suficiente para ser entregue.

A ideia é mostrar que integrar IA em produto não é só "chamar uma API de modelo", e sim tratar o LLM
como um componente de sistema — com contrato, validação e verificação de qualidade.

## Desenvolvimento assistido por IA

Este projeto foi construído com apoio intensivo de ferramentas de IA (assistente de código no
editor), de forma transparente:

- A IA foi usada para acelerar _scaffolding_, gerar rascunhos de código e documentação, revisar
  diffs e sugerir correções — inclusive uma revisão de engenharia sênior que apontou achados reais
  (ver [`docs/review-staff-etapa-12.md`](docs/review-staff-etapa-12.md)).
- **Cada decisão de arquitetura, cada correção e cada linha entregue passou por revisão humana.** As
  decisões não óbvias foram registradas como ADRs, e o código foi validado por testes, typecheck e
  lint antes de ser aceito.
- O uso de IA aqui espelha a própria tese do produto: a IA acelera, mas a qualidade depende de
  fronteiras claras, validação e um humano no controle das decisões.
