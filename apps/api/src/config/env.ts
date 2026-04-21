/**
 * Centralised environment configuration.
 * All env vars are validated at startup — fail fast if something is missing.
 */

import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().min(1),
  DATABASE_PROVIDER: z.enum(['postgresql', 'sqlite']).default('postgresql'),
  REDIS_URL: z.string().optional(), // optional — falls back to in-memory cache

  // HyperGuest — optional in mock mode (HYPERGUEST_MOCK=true)
  HYPERGUEST_MOCK: z.enum(['true', 'false']).default('false'),
  HYPERGUEST_BEARER_TOKEN: z.string().optional(),
  HYPERGUEST_SEARCH_DOMAIN: z.string().optional(),
  HYPERGUEST_BOOKING_DOMAIN: z.string().optional(),
  HYPERGUEST_STATIC_DOMAIN: z.string().optional(),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  // JWT — required for admin auth
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  WEB_BASE_URL: z.string().default('http://localhost:3000'),

  // Cache TTLs
  SEARCH_CACHE_TTL: z.coerce.number().int().positive().default(300),
  STATIC_DATA_CACHE_TTL: z.coerce.number().int().positive().default(86400),

  // Manual PDF path (defaults to apps/web/public/ in the monorepo)
  MANUAL_FILE_PATH: z.string().optional(),

  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
})

function loadEnv() {
  const result = EnvSchema.safeParse(process.env)
  if (!result.success) {
    console.error('❌ Invalid environment configuration:')
    console.error(result.error.flatten().fieldErrors)
    process.exit(1)
  }
  return result.data
}

export const env = loadEnv()
export type Env = typeof env
