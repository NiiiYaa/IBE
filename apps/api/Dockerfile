FROM node:20-bookworm-slim
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ibe/shared build
RUN pnpm --filter @ibe/onboarding-flows build
# Install Chromium + all system deps for Playwright (OTA scraper + external IBE scraper)
RUN cd /repo/apps/api && npx playwright install --with-deps chromium
RUN cd /repo/apps/api && npx prisma generate --schema=prisma/schema.prisma
RUN cd /repo/apps/api && npx tsc --noEmitOnError false || true
RUN cp -r /repo/apps/api/src/translations /repo/apps/api/dist/translations

ENV NODE_ENV=production
WORKDIR /repo/apps/api
EXPOSE 3001
CMD ["sh", "-c", "attempt=0; until npx prisma migrate deploy --schema=prisma/schema.prisma; do attempt=$((attempt+1)); if [ $attempt -ge 10 ]; then echo 'Migration failed after 10 attempts, giving up'; exit 1; fi; echo \"Migration attempt $attempt failed, retrying in 10s...\"; sleep 10; done && node dist/server.js"]
