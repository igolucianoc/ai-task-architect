# ── Estágio base ─────────────────────────────────────────────────────────────
FROM node:24-alpine AS base
WORKDIR /app
# dumb-init: init mínimo para encaminhar sinais (SIGTERM/SIGINT) ao processo Node.
# openssl: exigido pelo Prisma Client em runtime no Alpine (libssl).
RUN apk add --no-cache dumb-init openssl

# ── Dependências ──────────────────────────────────────────────────────────────
FROM base AS deps
# Ferramentas de build necessárias para dependências com etapa de compilação nativa.
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci

# ── Desenvolvimento ───────────────────────────────────────────────────────────
FROM base AS development
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Gera o Prisma Client com o binary engine correto para Alpine (musl).
RUN npx prisma generate
# Entrypoint aplica migrations + seed antes de iniciar (ver docker-entrypoint.sh).
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--", "./docker-entrypoint.sh"]
CMD ["npx", "nest", "start", "--watch"]

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Gera o Prisma Client (musl) antes de compilar.
RUN npx prisma generate
RUN npm run build

# ── Produção ──────────────────────────────────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production

# Dependências de runtime (sem devDependencies).
COPY package*.json ./
RUN npm ci --omit=dev

# Prisma Client gerado, artefatos compilados e recursos necessários ao boot.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma
COPY docker-entrypoint.sh ./docker-entrypoint.sh

# Prisma CLI + tsx ficam disponíveis para migrations/seed no boot mesmo na
# imagem de produção enxuta (o entrypoint os invoca via npm/npx).
RUN npm install --no-save prisma@6 tsx@4 \
  && chmod +x ./docker-entrypoint.sh \
  && chown -R node:node /app

EXPOSE 3000
USER node
ENTRYPOINT ["dumb-init", "--", "./docker-entrypoint.sh"]
CMD ["node", "dist/main"]
