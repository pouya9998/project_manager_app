FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
# npm registry (compose sets Liara). Leave empty to use registry.npmjs.org.
ARG NPM_REGISTRY=
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi
# Copy lockfile so installs are reproducible (avoids ERESOLVE / @nestjs/common@undefined)
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci --no-audit --no-fund --fetch-retries=5 --fetch-retry-maxtimeout=120000
COPY . .
RUN npx prisma generate && npm run build \
  && npm prune --omit=dev \
  && npm install prisma@5.22.0 --no-save --no-audit --no-fund

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && mkdir -p uploads
EXPOSE 3001
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
