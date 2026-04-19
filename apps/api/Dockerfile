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

ENV NODE_ENV=production
WORKDIR /repo/apps/api
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate resolve --applied 20260419000000_init --schema=prisma/schema.prisma 2>/dev/null || true && npx prisma migrate deploy --schema=prisma/schema.prisma && node dist/server.js"]
