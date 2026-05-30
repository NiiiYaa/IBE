import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3003'),
  DATABASE_URL: z.string(),
  HG_BO_API_BASE: z.string().url(),
  HG_BO_API_KEY: z.string(),
  SESSION_COOKIE_SECRET: z.string().min(16),
  ONBOARDING_APP_URL: z.string().url().default('http://localhost:3002'),
  INTERNAL_API_SECRET: z.string().min(16),
  IBE_API_CALLBACK_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATAFORSEO_LOGIN: z.string().optional(),
  DATAFORSEO_PASSWORD: z.string().optional(),
  RESIDENTIAL_PROXY_URL: z.string().url().optional(), // e.g. http://user:pass@gate.proxy-seller.com:8080
});

export const env = envSchema.parse(process.env);
