# ADR-009 — Arquitetura hexagonal da geração de tarefas

**Data:** 2026-09-01  
**Status:** Aceito  
**Relaciona-se com:** ADR-004 (Hugging Face como provider), ADR-002 (NestJS)

## Contexto

A Etapa 05 implementa o núcleo do produto: transformar uma necessidade técnica em linguagem natural
em uma especificação de implementação estruturada, gerada por LLM. O prompt 05 e o documento
`prompts/huggingface-access-token.md` impõem que:

- o domínio não dependa do SDK específico do provider;
- a resposta do LLM seja estruturada e validada antes de persistir;
- não se confie cegamente no JSON retornado;
- exista um provider fake para testes.

## Decisão

Organizar cada módulo sob `src/modules/<módulo>/` com quatro camadas canônicas
(`application`, `infrastructure`, `presentation`, `schemas`), seguindo o modelo de estrutura do
projeto. As dependências apontam para dentro (arquitetura hexagonal / ports & adapters):

```
modules/tasks/
├── application/                    # regras + orquestração; sem dependência de SDK
│   ├── task-specification.ts       # schema Zod + parse defensivo da saída do LLM
│   ├── prompt-builder.ts           # monta as mensagens de geração
│   ├── llm-provider.port.ts        # interface LlmProvider + token DI LLM_PROVIDER
│   └── generate-task-specification.use-case.ts   # orquestra a geração
├── infrastructure/                 # adapters concretos
│   ├── huggingface.provider.ts     # adapter do SDK oficial
│   ├── fake-llm.provider.ts        # adapter para testes/offline
│   └── tasks.repository.ts         # persistência (Prisma), transacional
├── presentation/
│   ├── tasks.controller.ts         # apresentação HTTP
│   └── tasks.presenter.ts          # entidades → views
├── schemas/
│   └── create-task.schema.ts       # validação de entrada (Zod)
└── tasks.module.ts                 # composição + factory do provider
```

**Regra de dependência:** `application` não importa o SDK nem o framework de infraestrutura. O caso
de uso depende da **porta** `LlmProvider` (injetada via token `LLM_PROVIDER`), nunca da
implementação concreta. A porta vive em `application` (é um contrato do domínio); os adapters em
`infrastructure` a implementam.

As pastas transversais `config/`, `common/` e `prisma/` permanecem em `src/` (não são módulos de
domínio). Os demais módulos (`auth`, `users`, `health`) seguem a mesma organização de camadas.

## Pontos-chave

### Saída do LLM tratada como não confiável
`parseTaskSpecification` extrai o primeiro objeto JSON balanceado (lidando com cercas markdown e
texto extra), faz `JSON.parse` defensivo e valida com Zod. Nunca lança — retorna um resultado
tipado. Um artefato só é persistido se a especificação for válida.

### Consistência de estado em falha
O `TasksRepository` usa transações. Em sucesso: run `SUCCEEDED` + artifact + `LlmUsage` + task
`COMPLETED`. Em falha (erro do provider **ou** saída inválida): run `FAILED` com a mensagem + task
`FAILED`, **sem** artefato inválido persistido.

### Seleção do provider por factory
`llmProviderFactory` injeta `FakeLlmProvider` em ambiente de teste ou quando o `HF_TOKEN` é um
placeholder, e `HuggingFaceProvider` quando há token real. Isso permite subir e demonstrar a app
sem depender da API externa, atendendo ao requisito de provider fake.

### Segurança e observabilidade
O `HuggingFaceProvider` recebe token e model por construtor (DI) — nunca lê `process.env` nem loga
o token. Logs registram apenas model, contagem de tokens e latência (ver
`prompts/huggingface-access-token.md`).

### Fundamentação na documentação oficial (source-driven)
A integração usa `@huggingface/inference` v4 (`InferenceClient.chatCompletion`), conforme a
documentação oficial: https://huggingface.co/docs/huggingface.js/main/en/inference/README

## Consequências

- Trocar de provider significa escrever um novo adapter de `LlmProvider` — o domínio e o caso de
  uso não mudam. (A troca de provider ainda exigiria atualizar o documento-fonte, por política.)
- A geração nesta etapa é **síncrona** no request HTTP. O streaming SSE e o desacoplamento entram
  nas Etapas 06 e 07.
- O artifact é persistido como JSON (`contentFormat: 'json'`), não Markdown — é a especificação
  validada; a renderização fica a cargo do frontend.

## Trade-off aceito

A camada de portas/adapters adiciona indireção para dois adapters (fake + HF). Justifica-se pelo
requisito explícito de isolar o SDK e testar sem rede — e é o que torna a suíte de testes rápida e
determinística.

## Adendo (refatoração para Clean Architecture + Vertical Slices)

**Status:** Aceito · atualiza a organização de camadas descrita acima sem alterar comportamento.

A organização em quatro pastas (`application`/`infrastructure`/`presentation`/`schemas`) evoluiu
para o padrão de referência do projeto — Clean Architecture com _vertical slices_ — preservando os
mesmos endpoints, contratos e comportamento. As mudanças foram estruturais (movimentação e
nomenclatura), não de regra de negócio:

- **`domain/`** passa a conter os contratos e regras puras: `llm-provider.port.ts`,
  `task-specification.ts`, `task-evaluation.ts`, `task-generation-events.ts` e a nova interface de
  repositório `task.repository.ts` (`ITaskRepository` + token `TASK_REPOSITORY` + tipos de leitura).
- **`persistence/`** substitui a antiga `infrastructure/` para dados: `tasks.repository.ts` virou
  `PrismaTaskRepository` (implementando `ITaskRepository`) e ganhou um par `InMemoryTaskRepository`
  para testes/offline.
- **`infra/`** (no módulo) reúne os adapters técnicos: `huggingface.provider`, `fake-llm.provider`,
  `evaluation.queue`, `evaluation.processor`.
- **`presentation/`** mantém controller/presenter e passa a hospedar `schemas/` (Zod).
- Os use-cases e o processor deixaram de depender da classe concreta do repositório e passaram a
  injetar a interface via `@Inject(TASK_REPOSITORY)`, fechando a regra de dependência
  `presentation → application → domain` com `persistence` implementando o `domain`.

Os transversais saíram de `src/{config,common,prisma}` para `src/core/` (config, observability) e
`src/infra/` (database/prisma, http, `app.module`, `main`). O `entryFile` do Nest passou a
`infra/main` (refletido em `nest-cli.json`, `package.json` e `Dockerfile`). Os demais módulos
(`auth`, `users`, `health`) seguem a mesma organização.
