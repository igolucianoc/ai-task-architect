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
EXPOSE 5173
CMD ["dumb-init", "npx", "vite", "--host", "0.0.0.0"]

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── Produção (nginx) ──────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
