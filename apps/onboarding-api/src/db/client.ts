import { PrismaClient } from '@prisma/client'
import { env } from '../env.js'

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof buildClient> }

function isConnectionError(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  const m = e.message
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
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '3')
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
