FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY vercel.json ./
COPY public ./public
COPY api ./api
COPY server ./server
COPY lib ./lib
COPY docker ./docker

USER node
CMD ["node", "docker/server.mjs"]
