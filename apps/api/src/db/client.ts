import { PrismaClient } from '@prisma/client'
import { env } from '../config/env.js'

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof buildClient> }

function isConnectionError(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  return (
    e.message.includes('Server has closed the connection') ||
    e.message.includes("Can't reach database server") ||
    e.message.includes('Connection timed out') ||
    e.message.includes('connection is closed')
  )
}

function buildDatabaseUrl(): string {
  const url = new URL(env.DATABASE_URL)
  // Cap connection pool — prevents exhausting Render PostgreSQL's connection limit
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '5')
  // Allow more time for TCP handshake (covers brief network blips on Render internal network)
  if (!url.searchParams.has('connect_timeout')) url.searchParams.set('connect_timeout', '30')
  return url.toString()
}

function buildClient() {
  const base = new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
    datasources: { db: { url: buildDatabaseUrl() } },
  })

  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          // Retry on transient TCP errors (Render internal network can have brief blips)
          const delays = [500, 1500, 3000]
          let lastError: unknown
          for (const delay of delays) {
            try {
              return await query(args)
            } catch (e) {
              if (!isConnectionError(e)) throw e
              lastError = e
              await new Promise(r => setTimeout(r, delay))
            }
          }
          throw lastError
        },
      },
    },
  })
}

export const prisma = globalForPrisma.prisma ?? buildClient()

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
