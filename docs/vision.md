# Visão do Produto — AI Task Architect

## Problema

Engenheiros e tech leads gastam tempo considerável ao transformar uma necessidade técnica vaga em
uma tarefa bem especificada: levantar contexto, identificar dependências, definir critérios de aceite,
estimar riscos e decompor o trabalho em etapas claras. Esse processo é repetitivo, cognitivamente
custoso e fortemente dependente da experiência individual.

## Solução

O **AI Task Architect** recebe uma necessidade técnica descrita em linguagem natural e devolve uma
especificação de implementação estruturada, gerada por um LLM e avaliada por uma etapa independente
de qualidade antes de ser entregue ao usuário.

O sistema não toma decisões de negócio pelo engenheiro — ele acelera o processo de transformar
intenção em plano executável.

## Proposta de valor

- Reduz o tempo de refinamento de tarefas técnicas.
- Padroniza o formato de especificação dentro de um time.
- Torna explícito o raciocínio por trás de decisões de design, riscos e dependências.
- Demonstra como integrar LLMs de forma responsável em um produto: com avaliação, não com confiança cega.

---

## Personas

### P1 — Engenheiro Sênior / Tech Lead

**Contexto:** Trabalha em time de produto, frequentemente responsável por refinar histórias técnicas
vindas do backlog antes de distribuí-las para o time.

**Dores:**
- Tarefas chegam sem contexto suficiente.
- Dependências ocultas só aparecem durante a implementação.
- Critérios de aceite são vagos ou ausentes.

**Objetivo com o produto:** Produzir uma especificação técnica detalhada a partir de um parágrafo de
contexto em menos de dois minutos.

**Comportamento esperado:** Usa a aplicação como ponto de partida. Revisa a saída, ajusta o que não
faz sentido e salva para referência futura.

---

### P2 — Engenheiro Pleno em crescimento

**Contexto:** Tem menos de três anos de experiência, ainda em formação na habilidade de decomposição
de problemas e escrita de especificações.

**Dores:**
- Dificuldade em antecipar riscos e dependências.
- Insegurança ao escrever critérios de aceite.
- Tende a subestimar escopo.

**Objetivo com o produto:** Aprender com exemplos concretos de especificação enquanto resolve
problemas reais.

**Comportamento esperado:** Usa a saída gerada como referência de estrutura. Com o tempo, começa a
identificar onde o LLM errou ou simplificou demais.

---

### P3 — Engenheiro Solo / Indie Dev

**Contexto:** Trabalha sem time, acumula papéis de produto, design e engenharia.

**Dores:**
- Sem revisor para validar decisões de design.
- Perde tempo trocando de modo mental entre "planejar" e "implementar".

**Objetivo com o produto:** Externalizar o trabalho de planejamento para focar em implementação.

**Comportamento esperado:** Usa o produto no início de cada feature nova. Raramente edita a saída —
quer velocidade.

---

## Casos de uso

### UC-01 — Gerar especificação de tarefa

**Ator:** Qualquer persona autenticada.

**Pré-condição:** Usuário autenticado, possui créditos ou acesso irrestrito.

**Fluxo principal:**
1. Usuário descreve a necessidade técnica em linguagem natural (campo livre, 50–2000 caracteres).
2. Sistema valida o input (tamanho, caracteres).
3. Sistema envia o contexto para o LLM via Hugging Face e inicia streaming SSE.
4. Especificação gerada é transmitida progressivamente para o cliente.
5. Ao final do streaming, o sistema dispara avaliação de qualidade (LLM Judge) assincronamente.
6. Resultado da avaliação é persistido e exibido ao usuário.
7. Tarefa é salva no histórico do usuário.

**Fluxos alternativos:**
- 3a. LLM falha ou timeout → sistema retorna erro descritivo, tarefa salva com status `failed`.
- 5a. Judge falha → tarefa salva com avaliação `unavailable`, não bloqueia o resultado principal.

**Pós-condição:** Especificação e avaliação persistidas, visíveis no histórico.

---

### UC-02 — Consultar histórico de tarefas

**Ator:** Usuário autenticado.

**Fluxo:** Usuário acessa o histórico, vê lista paginada de tarefas passadas com status, score de
qualidade e data. Pode abrir uma tarefa para reler a especificação completa.

---

### UC-03 — Autenticar-se

**Ator:** Visitante.

**Fluxo:** Usuário se registra com e-mail e senha. Recebe access token (curto) e refresh token
(persistido em cookie HttpOnly). Acessa rotas protegidas. Ao expirar o access token, cliente
renova via endpoint dedicado.

---

### UC-04 — Avaliar qualidade de uma especificação (interno)

**Ator:** Sistema (job assíncrono).

**Fluxo:** Após geração, um job processa a avaliação via segundo LLM (ou mesmo LLM com prompt de
avaliação). Retorna score e justificativa. Persiste o resultado na tarefa.

---

## Critérios de sucesso do produto

1. Uma especificação gerada deve conter: contexto, objetivo, critérios de aceite, passos de
   implementação, riscos identificados e dependências.
2. A avaliação de qualidade deve pontuar de 0–10 com justificativa em texto.
3. O sistema deve responder ao usuário dentro de 3 segundos para a primeira linha do streaming.
4. O histórico deve ser paginado e ordenado por data decrescente.
5. A aplicação deve ser executável localmente com um único comando Docker Compose.
