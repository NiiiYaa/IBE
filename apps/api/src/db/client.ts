import { PrismaClient } from '@prisma/client'
import { env } from '../config/env.js'

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof buildClient> }

function isConnectionError(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  const m = e.message
  // Prisma uses Unicode smart apostrophe U+2019 in "Can\u2019t reach database server"
  // so we match on the apostrophe-free substring to be safe.
  return (
    m.includes('reach database server') ||
    m.includes('Server has closed the connection') ||
    m.includes('Connection timed out') ||
    m.includes('connection is closed') ||
    m.includes('ECONNREFUSED') ||
    m.includes('ENOTFOUND') ||
    (e as { errorCode?: string }).errorCode === 'P1001' ||
    (e as { errorCode?: string }).errorCode === 'P1002' ||
    (e as { code?: string }).code === 'P1001' ||
    (e as { code?: string }).code === 'P1017'
  )
}

function buildDatabaseUrl(): string {
  const url = new URL(env.DATABASE_URL)
  // Cap connection pool to avoid exhausting Render PostgreSQL's connection limit
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '5')
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
          // Quick retry for transient TCP blips (e.g. idle connection closed).
          // For sustained DB outages we return fast and let the client retry via HTTP 503.
          const delays = [200, 800]
          let lastError: unknown
          for (const delay of delays) {
            try {
              return await query(args)
            } catch (e) {
              if (!isConnectionError(e)) throw e
              lastError = e
              void base.$disconnect()
              await new Promise(r => setTimeout(r, delay))
            }
          }
          try {
            return await query(args)
          } catch (e) {
            if (isConnectionError(e)) void base.$disconnect()
            throw e
          }
        },
      },
    },
  })
}

export const prisma = globalForPrisma.prisma ?? buildClient()

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
