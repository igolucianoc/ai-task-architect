# Projeto 01 — AI Task Architect

Este diretório contém os prompts de desenvolvimento incremental do primeiro projeto do portfólio público.

## Objetivo

Construir uma aplicação fullstack que transforme uma necessidade técnica descrita em linguagem natural em uma especificação de implementação estruturada, usando LLMs e uma etapa independente de avaliação.

O projeto deve contar uma história de evolução profissional: de desenvolvimento de software tradicional para engenharia de software orientada por arquitetura e, finalmente, AI Engineering.

## Stack alvo

- Backend: NestJS + TypeScript
- Frontend: Vue 3 + TypeScript
- Database: PostgreSQL + Prisma
- Cache/execução assíncrona: Redis + BullMQ quando necessário
- Streaming: SSE
- IA: SDK de LLM com provider abstraído
- Validação: Zod
- Testes: Vitest
- Infra: Docker Compose
- Documentação: Markdown + ADRs
- Design: `DESIGN.md` já existente na raiz do projeto

## Regra central de desenvolvimento

Os prompts devem ser executados sequencialmente. A IA deve primeiro inspecionar o estado atual do repositório e só então implementar a etapa.

Nunca apagar ou reescrever uma solução funcional sem justificar tecnicamente a mudança.

Não usar `any`. TypeScript deve permanecer em modo strict.

O `DESIGN.md` é a fonte de verdade visual do frontend. Ele já existe e NÃO deve ser criado, substituído ou alterado.

## Resultado esperado

Ao final, o repositório deve ser pequeno o suficiente para ser compreendido, mas completo o suficiente para demonstrar:

- Clean Architecture e/ou Vertical Slices sem overengineering;
- SOLID;
- API bem tipada;
- autenticação JWT com access token e refresh token;
- rate limiting nas rotas sensíveis;
- persistência e seeders;
- streaming via SSE;
- processamento assíncrono quando fizer sentido;
- testes unitários e E2E;
- observabilidade básica;
- uso responsável de LLM;
- avaliação de saída de LLM;
- documentação de decisões;
- execução local com Docker;
- frontend moderno e consistente com `DESIGN.md`.
