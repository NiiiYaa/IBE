# IBE — Hotel Internet Booking Engine

A production-grade Hotel Booking Engine powered by the HyperGuest platform.

## Architecture

```
/apps
  /api      Fastify backend (Node.js + TypeScript + Prisma)
  /web      Customer-facing IBE (Next.js 14 + Tailwind)
  /admin    Admin dashboard (Next.js — coming soon)
/packages
  /shared   Shared types, enums, Zod schemas, utilities
```

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9
- Docker + Docker Compose

## Getting started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.example apps/api/.env
cp .env.example apps/web/.env.local
```

Fill in your HyperGuest credentials in `apps/api/.env`:
- `HYPERGUEST_BEARER_TOKEN`
- `HYPERGUEST_SEARCH_DOMAIN`
- `HYPERGUEST_BOOKING_DOMAIN`
- `HYPERGUEST_STATIC_DOMAIN`

### 3. Start infrastructure

```bash
docker compose up -d
```

### 4. Run database migrations

```bash
pnpm db:migrate
```

### 5. Start development servers

```bash
pnpm dev
```

- API: http://localhost:3001
- Web: http://localhost:3000
- API health: http://localhost:3001/health

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/search` | Search availability |
| POST | `/api/v1/bookings` | Create a booking |
| GET | `/api/v1/properties/:id` | Get property static data |
| GET | `/health` | Health check |

## Testing

```bash
pnpm test              # run all tests
pnpm test:coverage     # with coverage report
```

## Project conventions

- All configuration via environment variables — never hardcoded
- All HyperGuest API calls isolated in `apps/api/src/adapters/hyperguest/`
- All shared types in `packages/shared` — never duplicated across apps
- `display` taxes must always be shown to the customer before checkout
- BAR price must never be breached on public channels
