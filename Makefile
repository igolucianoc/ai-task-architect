# AI Task Architect — atalhos de Developer Experience.
# Uso: `make <alvo>`. Rode `make help` para ver a lista.
#
# Requer Docker + Docker Compose. Os alvos são finos: apenas encapsulam os
# comandos documentados no README para reduzir o atrito do dia a dia.

COMPOSE := docker compose

.DEFAULT_GOAL := help
.PHONY: help up up-detached down down-clean build logs ps restart \
        migrate migrate-create seed shell-api shell-db \
        test test-e2e lint typecheck check

help: ## Lista os alvos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ── Ciclo de vida do ambiente ─────────────────────────────────────────────────
up: ## Sobe tudo (build + logs no terminal). Migrations e seed rodam no boot.
	$(COMPOSE) up --build

up-detached: ## Sobe tudo em background
	$(COMPOSE) up --build -d

down: ## Para os containers (mantém os volumes)
	$(COMPOSE) down

down-clean: ## Para os containers e APAGA os volumes (banco e redis)
	$(COMPOSE) down -v

build: ## Reconstrói as imagens sem subir
	$(COMPOSE) build

logs: ## Acompanha os logs de todos os serviços
	$(COMPOSE) logs -f

ps: ## Estado dos serviços e healthchecks
	$(COMPOSE) ps

restart: ## Reinicia apenas a API
	$(COMPOSE) restart api

# ── Banco de dados ────────────────────────────────────────────────────────────
migrate: ## Aplica migrations pendentes na API em execução
	$(COMPOSE) exec api npx prisma migrate deploy

migrate-create: ## Cria uma nova migration (make migrate-create name=descricao)
	$(COMPOSE) exec api npx prisma migrate dev --name $(name)

seed: ## Reexecuta o seed idempotente
	$(COMPOSE) exec api npm run db:seed

shell-api: ## Abre um shell no container da API
	$(COMPOSE) exec api sh

shell-db: ## Abre o psql no container do Postgres
	$(COMPOSE) exec postgres psql -U $${POSTGRES_USER:-postgres} -d $${POSTGRES_DB:-ai_task_architect}

# ── Qualidade e testes ────────────────────────────────────────────────────────
test: ## Testes unitários da API (dentro do container)
	$(COMPOSE) exec api npm test

test-e2e: ## Testes E2E da API (dentro do container)
	$(COMPOSE) exec api npm run test:e2e

lint: ## ESLint da API
	$(COMPOSE) exec api npm run lint

typecheck: ## Typecheck da API
	$(COMPOSE) exec api npm run typecheck

check: lint typecheck test ## Roda lint + typecheck + testes da API
