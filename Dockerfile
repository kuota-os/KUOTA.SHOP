# Dockerfile para Hyperlift (Spaceship) — servidor Express único en server.js
FROM node:22-alpine

WORKDIR /app

# Instala dependencias primero (aprovecha la caché de capas de Docker)
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Copia el resto del proyecto
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
