# ADR-011 — Observabilidade e uso de LLM

**Data:** 2026-09-02  
**Status:** Aceito  
**Relaciona-se com:** ADR-002 (backend NestJS), ADR-004 (Hugging Face), ADR-006 (BullMQ),
ADR-008 (modelo de persistência), ADR-010 (LLM-as-Judge e Quality Gate)

## Contexto

O prompt 09 pede observabilidade suficiente para explicar o comportamento do sistema: registrar
request/correlation id, duração, status, erros e a execução de LLM (provider, model, tokens de
prompt/conclusão/total, latência, custo estimado e versão do prompt). Nunca registrar senha, access
token, refresh token, secrets ou conteúdo sensível sem necessidade. Também pede uma visão simples no
frontend para as métricas de execução — sem transformar o projeto numa plataforma de observabilidade
completa — e, caso Sentry/OpenTelemetry seja adotado, que a integração seja abstraída para não
acoplar o domínio.

Antes desta etapa, o backend usava o `Logger` textual padrão do Nest, sem correlation id de HTTP e
sem logs estruturados. O uso de LLM (`LlmUsage`) era persistido mas nunca exposto por nenhuma API, e
não havia cálculo de custo.

## Decisão

### Correlation id via AsyncLocalStorage (`nestjs-cls`)

Cada requisição recebe um **correlation id** propagado por AsyncLocalStorage através da biblioteca
`nestjs-cls`. O id reaproveita o header de entrada `x-correlation-id` quando presente e não vazio;
caso contrário, gera um UUID v4. O valor é gravado sob uma chave estável (`CORRELATION_ID_KEY`) no
`setup` do middleware do CLS — sem depender de `cls.getId()`, para não acoplar com a ordem interna do
middleware. O id pode ser lido de qualquer ponto do request (interceptor, use-cases) injetando o
`ClsService`.

Escolhemos CLS (em vez de propagar o id manualmente por parâmetro) porque o correlation id precisa
alcançar naturalmente as camadas profundas (geração e avaliação de LLM) e o **worker BullMQ**, que
roda fora do ciclo do request.

### Logging estruturado JSON (`AppLogger`)

Um `AppLogger` (implementa `LoggerService`) emite **uma linha JSON por evento**, com `timestamp`,
`level`, `message`, `context`, `correlationId` (lido do CLS quando há contexto ativo) e um objeto
`meta` opcional. A API expõe apenas `message: string` + `meta` explícito — **não há caminho que
serialize objetos crus** (Request, body, headers), o que evita vazamento acidental de secrets.

O `AppLogger` é registrado como logger da aplicação via `app.useLogger(app.get(AppLogger))`, para que
**todos** os logs (inclusive os internos do Nest) saiam num único formato JSON. É uma decisão de
consistência para coleta/leitura, não uma exigência técnica — os logs do domínio já sairiam
estruturados apenas pelo interceptor e pelos use-cases.

### Interceptor HTTP e header de resposta

Um `HttpLoggingInterceptor` global registra, para cada requisição (sucesso e erro), uma linha JSON
com `method`, `url`, `statusCode`, `durationMs` e `correlationId` — nunca body, headers, query ou
tokens. Ele também espelha o correlation id no header de resposta `x-correlation-id`. O erro é sempre
repropagado. O `GlobalExceptionFilter` foi registrado via `APP_FILTER` (habilitando DI do
`ClsService`) para incluir o `correlationId` no corpo e no log de erro.

### Correlation id no worker BullMQ

Como a avaliação (LLM-as-Judge, ADR-010) roda de forma assíncrona fora do request, o `EvaluationQueue`
lê o correlation id do CLS no momento do enfileiramento e o grava no payload do job. O
`EvaluationProcessor` abre um escopo CLS (`cls.run`) e define o correlation id do job antes de
processar — assim os logs da execução assíncrona mantêm a correlação ponta a ponta. Para jobs sem o
campo (legado), gera um UUID próprio, garantindo rastreabilidade.

### Execução de LLM registrada como metadados

Os use-cases de geração e avaliação logam, em JSON, os metadados de cada chamada de LLM:
`operation` (`generation`/`evaluation`), `model`, `promptTokens`, `completionTokens`, `totalTokens`,
`latencyMs`, `correlationId` e, na avaliação, `promptVersion`. **Nunca** logam o prompt, o conteúdo
gerado nem tokens de autenticação.

### Custo estimado configurável

O custo é derivado do consumo de tokens por uma função pura `estimateLlmCost`, a partir de rates
configuráveis por 1000 tokens (`LLM_COST_PER_1K_PROMPT_TOKENS` e `LLM_COST_PER_1K_COMPLETION_TOKENS`,
ambas com **default 0**). O resultado é persistido no campo `estimatedCost` (`Decimal(12,6)`) de
`LlmUsage`, tanto na geração quanto na avaliação. Com rates zeradas, o custo é 0 — comportamento
neutro e opt-in.

Optamos por custo **configurável e persistido** (em vez de uma tabela de preços fixa) porque o
Hugging Face não expõe um preço por token estável por modelo; fixar valores seria afirmar um custo
que pode não ser real. As rates ficam no backend (nunca no bundle do frontend).

### Exposição na API e visão no frontend

`GET /tasks/:id` passa a incluir o uso de LLM em `lastRun.usage` (geração) e `evaluation.usage`
(avaliação) — `model`, tokens, `latencyMs`, `estimatedCost` — e um agregado `llmTotals` por tarefa.
O contrato é espelhado nos tipos do frontend. A página de detalhe ganhou um **painel discreto**
(`LlmMetricsPanel`) que mostra essas métricas no estilo do DESIGN.md, com um estado vazio calmo
quando não há uso. O custo é formatado como número puro em pt-BR (até 6 casas), sem fixar símbolo de
moeda, já que é uma estimativa.

## Alternativas consideradas

| Opção | Motivo de descarte |
|-------|-------------------|
| Propagar o correlation id manualmente por parâmetro | Verboso e frágil; não alcançaria naturalmente o worker BullMQ |
| `nestjs-pino`/pino como logger | Solução robusta, mas troca a fundação de logging de forma mais invasiva do que o necessário nesta etapa |
| Custo por tabela de preços fixa por modelo | O preço por token do Hugging Face não é estável/público; afirmaria um custo possivelmente irreal |
| Não expor `LlmUsage` (só logar) | O prompt 09 pede uma visão de métricas no frontend; os dados precisam sair pela API |
| Plataforma completa (Sentry/OTel/dashboards) | Escopo além do pedido; o prompt pede explicitamente para não virar plataforma de observabilidade |

## Consequências

- Há uma nova dependência (`nestjs-cls`) e um custo mínimo de AsyncLocalStorage por request —
  aceitável para a escala do projeto e padrão de mercado.
- Um eventual Sentry/OpenTelemetry pode ser plugado no `AppLogger`/interceptor sem tocar no domínio,
  que só depende do `ClsService` e do `AppLogger` (abstrações finas), atendendo ao requisito de não
  acoplamento.
- O custo estimado é tão bom quanto as rates configuradas; sem configuração, aparece como 0 — o que é
  honesto e não engana.

## Trade-off aceito

Substituir o logger padrão do Nest por JSON perde a legibilidade colorida no desenvolvimento local em
troca de um formato único, parseável e com correlation id em toda linha. Para este projeto, a
consistência e a rastreabilidade valem mais que a estética do console. Caso incomode em
desenvolvimento, a substituição global (`app.useLogger`) pode ser condicionada por ambiente sem afetar
o restante da observabilidade.
