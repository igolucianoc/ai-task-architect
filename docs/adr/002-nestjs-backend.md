# ADR-002 — NestJS como framework de backend

**Data:** 2026-09-01  
**Status:** Aceito

## Contexto

O backend precisa expor rotas HTTP REST, um endpoint SSE de longa duração, jobs assíncronos e
injeção de dependência estruturada. Precisamos escolher o framework Node.js.

## Decisão

Usar **NestJS** com TypeScript strict como framework de backend.

## Justificativa

- NestJS fornece um sistema de módulos e DI que mapeia diretamente para a arquitetura de
  módulos definida (AuthModule, TaskModule, EvaluationModule, LlmModule, UsersModule).
- Suporte nativo a `@Sse()` para Server-Sent Events sem biblioteca extra.
- Integração oficial com BullMQ via `@nestjs/bullmq`.
- Integração oficial com Passport.js para JWT.
- TypeScript strict por padrão — sem necessidade de configuração adicional.
- Amplamente reconhecido em portfólios de engenharia backend Node.js.

## Alternativas consideradas

| Opção | Motivo de descarte |
|-------|-------------------|
| Fastify puro | Requer estruturar DI e módulos manualmente; mais trabalho sem ganho proporcional |
| Express puro | Idem Fastify; sem DI, sem decorators, muito boilerplate |
| Hono | Excelente para edge, mas DI e SSE menos maduros no ecossistema atual |

## Consequências

- Curva de aprendizado de decorators e DI para quem lê o código pela primeira vez.
- `@nestjs/testing` facilita testes unitários de módulos com providers mockados.
- Estrutura de arquivos segue convenção NestJS (`*.module.ts`, `*.service.ts`, `*.controller.ts`),
  organizada por módulo e camada em `src/modules/<módulo>/{application,domain,persistence,presentation}`
  (ver ADR-009). Transversais ficam em `src/core/` (config, observability) e `src/infra/`
  (database/prisma, http, `app.module`, `main`).
- TypeScript strict ativo: sem `any`, sem `@ts-ignore`, inferência explícita obrigatória.
