# ADR-001 — Estrutura de monorepo

**Data:** 2026-09-01  
**Status:** Aceito

## Contexto

O projeto tem dois artefatos distintos: uma API NestJS e uma SPA Vue 3. Precisamos decidir como
organizar o repositório: monorepo com pacotes separados, repositórios independentes ou monorepo
simples sem tooling de workspace.

## Decisão

Adotar **monorepo simples** com duas pastas de primeiro nível: `apps/api` e `apps/web`, sem
tooling de workspace (sem Nx, sem Turborepo, sem pnpm workspaces).

Estrutura resultante:

```
/
├── apps/
│   ├── api/          # NestJS
│   └── web/          # Vue 3
├── docs/             # Documentação e ADRs
├── docker-compose.yml
├── DESIGN.md
└── README.md
```

## Justificativa

- O projeto tem dois artefatos, não dezenas. Tooling de monorepo (Nx, Turborepo) adiciona
  complexidade de configuração que não se paga nesta escala.
- Pastas separadas dentro do mesmo repositório permitem compartilhar configurações de CI e
  o `docker-compose.yml` raiz sem acoplamento entre pacotes.
- Reviewers do portfólio conseguem navegar por `apps/api` e `apps/web` de forma independente.
- Futuramente, se o projeto crescer, a migração para workspaces é incremental.

## Alternativas consideradas

| Opção | Motivo de descarte |
|-------|-------------------|
| Repositórios separados | Fragmenta `docker-compose.yml` raiz, dificulta execução local unificada |
| pnpm workspaces | Útil se houver pacotes compartilhados; não há neste projeto |
| Nx / Turborepo | Overhead de configuração injustificado para dois apps |

## Consequências

- `apps/api` e `apps/web` têm seus próprios `package.json`, `tsconfig.json` e scripts.
- Não há pacote `shared` por ora; tipos compartilhados são duplicados ou comunicados via contrato de API.
- O `docker-compose.yml` na raiz orquestra ambos os serviços mais PostgreSQL e Redis.
