# Prompt 03 — PostgreSQL, Prisma e seeders

Implemente o modelo de persistência.

## Entidades iniciais

Modele somente o necessário para:

- User;
- RefreshSession;
- Task;
- TaskGenerationRun;
- TaskEvaluation;
- TaskArtifact;
- LLMUsage.

Os nomes podem ser ajustados se a arquitetura definida na etapa 01 justificar.

## Requisitos

- Prisma;
- migrations;
- índices adequados;
- timestamps;
- relações explícitas;
- constraints coerentes;
- status representados por enums ou tipos seguros;
- seed determinístico.

## Seeder

O comando de seed deve criar dados realistas para demonstrar a aplicação sem depender de um provider de LLM.

Inclua:

- usuários;
- tarefas em diferentes estados;
- execuções;
- avaliações;
- consumo de tokens;
- exemplos de resultados.

O seed deve ser idempotente ou seguro para execução repetida.

Não coloque dados pessoais reais.

## Validação

Execute migration e seed em ambiente limpo via Docker.
