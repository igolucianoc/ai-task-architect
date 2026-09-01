# Prompt 02 — Bootstrap, monorepo e infraestrutura

Implemente a base do projeto.

## Estrutura desejada

- `/api` — NestJS
- `/web` — Vue 3
- `/docs` — documentação e ADRs
- `docker-compose.yml`

Use uma estrutura simples. Só introduza workspace/monorepo tooling adicional se houver benefício claro.

## Infra

Docker Compose deve disponibilizar:

- PostgreSQL;
- Redis.

A aplicação deve conseguir subir localmente de forma previsível.

## Backend

Configurar:

- NestJS;
- TypeScript strict;
- configuração por ambiente;
- logging estruturado básico;
- tratamento global de erros;
- health check;
- Zod para validação de entrada quando apropriado.

## Frontend

Configurar Vue 3 + TypeScript.

Antes de qualquer tela, leia `DESIGN.md`.

Crie apenas a casca inicial necessária, sem inventar um design system paralelo.

## Critérios

- sem `any`;
- scripts claros;
- `.env.example`;
- Docker funcional;
- health check funcional;
- testes básicos executando.
