# ADR-012 — Execução com um comando e inicialização automática do banco

**Data:** 2026-09-01
**Status:** Aceito
**Relaciona-se com:** ADR-001 (estrutura do monorepo), ADR-002 (backend NestJS),
ADR-008 (modelo de persistência)

## Contexto

O prompt 11 pede que outra pessoa consiga executar o projeto com algo próximo de
`docker compose up --build`, com healthchecks, migrations, seed, variáveis de
ambiente e troubleshooting documentados, "sem ordem manual frágil entre containers"
e sem secrets embutidos.

Antes desta etapa a infraestrutura já existia (Dockerfiles multi-stage, Compose com
healthchecks de Postgres e Redis, seed idempotente), mas a preparação do banco era
manual: subir os containers não aplicava migrations nem rodava o seed. Quem clonasse
o repositório precisava lembrar de executar `prisma migrate deploy` e o seed na ordem
certa — exatamente a fragilidade que a etapa pede para eliminar. Havia ainda dois
problemas concretos: o `prisma/seed.ts` importava `bcrypt` (não instalado; o código
usa `bcryptjs`), o que quebraria o seed no boot, e não existiam arquivos
`.dockerignore`, então o `COPY . .` levava `node_modules`, `dist` e o `.env` para a
imagem.

## Decisão

### Entrypoint prepara o banco antes de servir

A imagem da API passa a usar `docker-entrypoint.sh` como `ENTRYPOINT` (com
`dumb-init` para encaminhar sinais). No boot ele:

1. aplica `prisma migrate deploy` (idempotente por natureza);
2. executa o seed de demonstração (idempotente, via upserts com IDs fixos);
3. faz `exec "$@"` para o comando real (dev: `nest start --watch`; prod:
   `node dist/main`), preservando o encaminhamento de sinais.

Migrations usam `set -e` e são **fail-fast**: se falharem, a API não sobe. O seed é
**tolerante a erro**: se não puder rodar (por exemplo, numa imagem de produção
enxuta sem as ferramentas de seed), o boot registra um aviso e segue sem os dados de
demonstração. Ambos os passos podem ser desligados por `RUN_MIGRATIONS=false` e
`RUN_DB_SEED=false`.

### Ordem garantida por healthchecks, não por espera manual

O Compose usa `depends_on` com `condition: service_healthy` em cadeia: a API espera
Postgres e Redis saudáveis; o Web espera a API saudável (agora com healthcheck
próprio). O `start_period` do healthcheck da API foi ampliado para 60s para cobrir o
tempo de migrations + seed no primeiro boot. Assim a ordem de inicialização é
determinística sem `sleep` ou scripts de espera frágeis.

### Correções de suporte

- `prisma/seed.ts` passa a importar `bcryptjs`, alinhado ao código de produção.
- Adicionados `.dockerignore` em `api/` e `web/` para excluir `node_modules`,
  `dist`, `coverage` e, sobretudo, arquivos `.env` — evitando inchar a imagem e
  vazar segredos para dentro dela.
- Um `Makefile` na raiz encapsula os comandos mais usados (`up`, `logs`, `seed`,
  `check`, `down-clean`, etc.) como camada fina sobre o `docker compose`.

## Consequências

- `docker compose up --build` sobe o sistema pronto para uso, com esquema aplicado e
  dados de demonstração, sem passos manuais.
- O seed roda a cada boot; por ser idempotente, isso é seguro, ao custo de alguns
  segundos no start. Quem não quiser o comportamento usa `RUN_DB_SEED=false`.
- A imagem de produção precisa do Prisma CLI e do `tsx` disponíveis para
  migrations/seed no boot; eles são instalados no estágio de produção sem serem
  persistidos no `package.json`.
- Nenhum secret é embutido: `HF_TOKEN` e demais valores vêm de variáveis de ambiente
  / arquivos `.env` locais, que estão no `.gitignore` e são excluídos das imagens.
