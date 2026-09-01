# Modelo de Domínio — AI Task Architect

> **Nota (Etapa 03):** este documento descreve o modelo **conceitual**. A implementação de
> persistência refinou o modelo para sete entidades (`User`, `RefreshSession`, `Task`,
> `TaskGenerationRun`, `TaskArtifact`, `TaskEvaluation`, `LlmUsage`) para suportar retentativas,
> imutabilidade do resultado e observabilidade de tokens. Ver
> [ADR-008](adr/008-persistence-model-refinement.md) e `api/prisma/schema.prisma`.
> O contrato conceitual abaixo permanece válido.

## Entidades

### User
Representa um usuário autenticado da plataforma.

```
User {
  id          : UUID (PK)
  email       : string (unique)
  passwordHash: string
  createdAt   : DateTime
  updatedAt   : DateTime

  tasks       : Task[]
  refreshTokens: RefreshToken[]
}
```

---

### Task
Representa uma solicitação de especificação técnica feita por um usuário.

```
Task {
  id          : UUID (PK)
  userId      : UUID (FK → User)
  description : string          -- input do usuário (50–2000 chars)
  content     : string | null   -- saída gerada pelo LLM
  status      : TaskStatus
  createdAt   : DateTime
  updatedAt   : DateTime

  evaluation  : Evaluation | null
}

TaskStatus = 'pending' | 'streaming' | 'completed' | 'failed'
```

**Ciclo de vida:**
```
pending → streaming → completed
                   ↘ failed
```

- `pending`: tarefa criada, aguardando início do streaming.
- `streaming`: LLM está gerando, chunks chegando via SSE.
- `completed`: geração concluída, conteúdo persistido.
- `failed`: erro no LLM ou timeout — conteúdo pode ser parcial ou nulo.

---

### Evaluation
Resultado da avaliação de qualidade (LLM Judge) vinculada a uma `Task`.

```
Evaluation {
  id          : UUID (PK)
  taskId      : UUID (FK → Task, unique)
  score       : number | null   -- 0–10, null se avaliação falhou
  rationale   : string | null   -- justificativa textual do score
  status      : EvaluationStatus
  createdAt   : DateTime
  updatedAt   : DateTime
}

EvaluationStatus = 'pending' | 'completed' | 'unavailable'
```

- `pending`: job enfileirado, aguardando processamento.
- `completed`: avaliação concluída com score e rationale.
- `unavailable`: job falhou ou LLM retornou resposta não-parseável.

---

### RefreshToken
Refresh tokens persistidos para permitir revogação.

```
RefreshToken {
  id        : UUID (PK)
  userId    : UUID (FK → User)
  token     : string (unique) -- UUID opaco
  expiresAt : DateTime
  revokedAt : DateTime | null
  createdAt : DateTime
}
```

Um token com `revokedAt != null` ou `expiresAt < now` é considerado inválido.

---

## Relacionamentos

```
User 1 ──< Task         (um usuário tem muitas tarefas)
Task 1 ──o Evaluation   (uma tarefa tem zero ou uma avaliação)
User 1 ──< RefreshToken (um usuário pode ter vários refresh tokens ativos)
```

---

## Invariantes de domínio

1. `Task.description` deve ter entre 50 e 2000 caracteres.
2. `Task.content` só é preenchido quando `status = completed | failed`.
3. `Evaluation` só é criada após `Task.status = completed`.
4. `Evaluation.score` deve estar no intervalo [0, 10] quando presente.
5. Um `RefreshToken` revogado nunca pode ser reativado.
6. Cada `Task` pertence a exatamente um `User` — sem tarefas anônimas.

---

## Estrutura do conteúdo gerado (contrato de saída do LLM)

O campo `Task.content` contém a especificação gerada em Markdown estruturado. O LLM é
instruído a produzir sempre este formato:

```markdown
## Contexto
[descrição do problema e motivação]

## Objetivo
[o que deve ser implementado]

## Critérios de aceite
- [ ] critério 1
- [ ] critério 2
...

## Passos de implementação
1. passo 1
2. passo 2
...

## Riscos e dependências
- risco ou dependência 1
- risco ou dependência 2
...

## Estimativa de esforço
[pequena | média | grande] — [justificativa]
```

---

## Rubrica de avaliação (LLM Judge)

O Judge avalia a especificação em cinco dimensões, cada uma com peso igual:

| Dimensão | Descrição |
|----------|-----------|
| Clareza | A especificação é compreensível sem ambiguidade? |
| Completude | Todos os campos obrigatórios estão presentes e preenchidos? |
| Acionabilidade | Os passos são executáveis por um engenheiro? |
| Riscos | Os riscos identificados são reais e relevantes? |
| Formatação | O Markdown está correto e consistente com o contrato? |

Score final = média das cinco dimensões (0–10).

O Judge retorna JSON:
```json
{
  "score": 8.4,
  "rationale": "A especificação está clara e bem estruturada. Os critérios de aceite são testáveis. Falta detalhar a dependência de banco de dados mencionada vagamente.",
  "dimensions": {
    "clarity": 9,
    "completeness": 8,
    "actionability": 9,
    "risks": 7,
    "formatting": 9
  }
}
```
