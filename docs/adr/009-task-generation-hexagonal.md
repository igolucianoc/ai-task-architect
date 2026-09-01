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

Organizar o módulo `tasks` em camadas com dependências apontando para dentro (arquitetura
hexagonal / ports & adapters):

```
tasks/
├── domain/                         # núcleo, sem dependências de framework/SDK
│   ├── task-specification.ts       # schema Zod + parse defensivo da saída do LLM
│   ├── prompt-builder.ts           # monta as mensagens de geração
│   └── ports/
│       └── llm-provider.port.ts    # interface LlmProvider + token DI LLM_PROVIDER
├── use-cases/
│   └── generate-task-specification.use-case.ts   # orquestra a geração
├── infra/
│   ├── huggingface/huggingface.provider.ts       # adapter do SDK oficial
│   └── fake/fake-llm.provider.ts                 # adapter para testes/offline
├── tasks.repository.ts             # persistência (Prisma), transacional
├── tasks.controller.ts             # apresentação HTTP
├── tasks.presenter.ts              # entidades → views
└── tasks.module.ts                 # composição + factory do provider
```

**Regra de dependência:** `domain` não importa `infra`, Prisma nem o SDK. O caso de uso depende da
**porta** `LlmProvider` (injetada via token `LLM_PROVIDER`), nunca da implementação concreta.

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
