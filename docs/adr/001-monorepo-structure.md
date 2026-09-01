# ADR-001 — Estrutura de monorepo

**Data:** 2026-09-01  
**Status:** Aceito

## Contexto

O projeto tem dois artefatos distintos: uma API NestJS e uma SPA Vue 3. Precisamos decidir como
organizar o repositório: monorepo com pacotes separados, repositórios independentes ou monorepo
simples sem tooling de workspace.

## Decisão

Adotar **monorepo simples** com duas pastas de primeiro nível — `api/` e `web/` — na raiz do
repositório do projeto (`ai-task-architect/`), sem tooling de workspace (sem Nx, sem Turborepo,
sem pnpm workspaces).

Estrutura resultante:

```
ai-task-architect/          # raiz do repositório do projeto
├── api/              # NestJS
├── web/              # Vue 3
├── docs/             # documentação e ADRs
├── docker-compose.yml
└── README.md
```

## Justificativa

- O projeto tem dois artefatos, não dezenas. Tooling de monorepo (Nx, Turborepo) adiciona
  complexidade de configuração que não se paga nesta escala.
- Pastas separadas dentro do mesmo repositório permitem compartilhar configurações de CI e
  o `docker-compose.yml` sem acoplamento entre pacotes.
- Reviewers conseguem navegar por `api/` e `web/` de forma independente.
- Futuramente, se o projeto crescer, a migração para workspaces é incremental.

## Alternativas consideradas

| Opção | Motivo de descarte |
|-------|-------------------|
| Repositórios separados | Fragmenta o `docker-compose.yml`, dificulta execução local unificada |
| pnpm workspaces | Útil se houver pacotes compartilhados; não há neste projeto |
| Nx / Turborepo | Overhead de configuração injustificado para dois apps |

## Consequências

- `api/` e `web/` têm seus próprios `package.json`, `tsconfig.json` e scripts.
- Não há pacote `shared` por ora; tipos compartilhados são duplicados ou comunicados via contrato de API.
- O `docker-compose.yml` na raiz do projeto orquestra ambos os serviços mais PostgreSQL e Redis.

## Nota de evolução

A estrutura inicial usava `apps/api` e `apps/web` sob a raiz do repositório. O projeto foi
posteriormente reorganizado para ter sua própria raiz (`ai-task-architect/`) com `api/` e `web/`
como pastas de primeiro nível, separando o material do produto do material de portfólio que vive
fora do repositório. A decisão de fundo (monorepo simples, sem tooling de workspace) permanece.
