#!/bin/sh
# Entrypoint da API — prepara o banco antes de iniciar o processo.
#
# Objetivo (Etapa 11): tornar a inicialização determinística e sem ordem manual
# frágil. O Compose já garante, via healthchecks, que o Postgres esteja pronto
# antes de subir a API; aqui apenas aplicamos o esquema e (opcionalmente) o seed.
#
# Variáveis relevantes:
#   RUN_MIGRATIONS=false  -> pula `prisma migrate deploy`
#   RUN_DB_SEED=false     -> pula o seed de demonstração
#
# `set -e` aborta em qualquer erro de comando; migrations que falham devem
# impedir a subida da API (fail-fast) em vez de deixá-la rodar sem esquema.
set -e

log() {
  echo "[entrypoint] $1"
}

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  log "Aplicando migrations (prisma migrate deploy)..."
  npx prisma migrate deploy
else
  log "RUN_MIGRATIONS=false — migrations ignoradas."
fi

if [ "${RUN_DB_SEED:-true}" = "true" ]; then
  # O seed é idempotente (upserts com IDs fixos); reexecutar é seguro.
  # Não deve derrubar a API se falhar (ex.: seed indisponível em imagem de
  # produção enxuta), por isso é tolerante a erro.
  log "Executando seed de demonstração (idempotente)..."
  if npm run --silent db:seed; then
    log "Seed concluído."
  else
    log "Aviso: seed não pôde ser executado; seguindo sem dados de demonstração."
  fi
else
  log "RUN_DB_SEED=false — seed ignorado."
fi

log "Iniciando a aplicação: $*"
exec "$@"
