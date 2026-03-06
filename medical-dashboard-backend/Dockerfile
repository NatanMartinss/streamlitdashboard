# Etapa de build
FROM node:22-alpine AS builder
WORKDIR /app

# Copia apenas os manifests para instalar dependências
COPY package.json package-lock.json* ./
RUN if [ -f "package-lock.json" ]; then npm ci; else npm install; fi

# Copia o restante do código e compila para produção
COPY . .
RUN npm run build

# Etapa de runtime
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Instala somente dependências de produção
COPY package.json package-lock.json* ./
RUN if [ -f "package-lock.json" ]; then npm ci --omit=dev; else npm install --only=production; fi

# Copia artefatos compilados
COPY --from=builder /app/dist ./dist

# Porta padrão
ENV PORT=8000
EXPOSE 8000

CMD ["node", "dist/main.js"]
