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

function buildClient() {
  const base = new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  })

  // Auto-retry once on stale-connection errors (e.g. after Render free-tier sleep)
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          try {
            return await query(args)
          } catch (e) {
            if (isConnectionError(e)) {
              await new Promise(r => setTimeout(r, 300))
              return query(args)
            }
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
