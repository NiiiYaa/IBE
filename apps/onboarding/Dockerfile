FROM node:20-alpine AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# These are baked at build time — set them as Render build env vars
ARG NEXT_PUBLIC_ONBOARDING_API_URL=https://onboarding-api.onrender.com
ENV NEXT_PUBLIC_ONBOARDING_API_URL=$NEXT_PUBLIC_ONBOARDING_API_URL

WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ibe/shared build
RUN pnpm --filter @ibe/onboarding-flows build
RUN pnpm --filter @ibe/onboarding build

FROM node:20-alpine AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

WORKDIR /app
COPY --from=builder /repo/apps/onboarding/.next/standalone ./
COPY --from=builder /repo/apps/onboarding/.next/static ./.next/static
COPY --from=builder /repo/apps/onboarding/public ./public

EXPOSE 3002
# In pnpm monorepos, Next.js standalone places server.js at the package path
CMD ["sh", "-c", "node apps/onboarding/server.js 2>/dev/null || node server.js"]
