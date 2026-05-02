FROM node:20-alpine
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN apk add --no-cache openssl

WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ibe/shared build
RUN cd /repo/apps/api && npx prisma generate --schema=prisma/schema.prisma
RUN cd /repo/apps/api && npx tsc --noEmitOnError false || true
RUN cp -r /repo/apps/api/src/translations /repo/apps/api/dist/translations

ENV NODE_ENV=production
WORKDIR /repo/apps/api
EXPOSE 3001
CMD ["sh", "-c", "attempt=0; until npx prisma migrate deploy --schema=prisma/schema.prisma; do attempt=$((attempt+1)); if [ $attempt -ge 10 ]; then echo 'Migration failed after 10 attempts, giving up'; exit 1; fi; echo \"Migration attempt $attempt failed, retrying in 10s...\"; sleep 10; done && node dist/server.js"]
