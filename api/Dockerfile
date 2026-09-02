# ── Estágio base ─────────────────────────────────────────────────────────────
FROM node:24-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init

# ── Dependências ──────────────────────────────────────────────────────────────
FROM base AS deps
COPY package*.json ./
RUN npm ci --ignore-scripts

# ── Desenvolvimento ───────────────────────────────────────────────────────────
FROM base AS development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Gera o Prisma Client com o binary engine correto para Alpine (musl).
RUN npx prisma generate
EXPOSE 3000
CMD ["dumb-init", "npx", "nest", "start", "--watch"]

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

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Remove dependências de desenvolvimento após o build
RUN npm prune --omit=dev

EXPOSE 3000
USER node
CMD ["dumb-init", "node", "dist/main"]
