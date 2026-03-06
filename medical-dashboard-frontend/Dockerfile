# Etapa de dependências
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f "package-lock.json" ]; then npm ci; else npm install; fi

# Etapa de build
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Injeta a URL da API no build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

# Etapa de runtime
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Disponibiliza a URL também em runtime (para uso do cliente/browser)
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Instala apenas dependências de produção
COPY package.json package-lock.json* ./
RUN if [ -f "package-lock.json" ]; then npm ci --omit=dev; else npm install --only=production; fi

# Copia artefatos do build
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["npm", "run", "start"]
