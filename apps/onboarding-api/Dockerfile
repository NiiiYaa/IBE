FROM node:20-bookworm-slim
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
# System deps: openssl for Prisma, Chromium deps for Playwright (IBE harvesting + screenshots)
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ibe/shared build
RUN pnpm --filter @ibe/onboarding-flows build
# Playwright + Chromium for stealth browser (IBE resolver, screenshots, harvesting)
RUN cd /repo/apps/onboarding-api && npx playwright install --with-deps chromium
RUN cd /repo/apps/api && npx prisma generate --schema=prisma/schema.prisma
RUN cd /repo/apps/onboarding-api && npx tsc

ENV NODE_ENV=production
WORKDIR /repo/apps/onboarding-api
EXPOSE 3003
CMD ["node", "dist/server.js"]
