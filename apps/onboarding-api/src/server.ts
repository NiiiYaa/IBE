import { buildApp } from './app.js'
import { env } from './env.js'
import { prisma } from './db/client.js'
import { startHarvestQueue } from './services/harvest-queue.service.js'

const app = await buildApp()

const queueInterval = startHarvestQueue()

const shutdown = async () => {
  clearInterval(queueInterval)
  await app.close()
  await prisma.$disconnect()
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown())
process.on('SIGINT', () => void shutdown())

await app.listen({ port: parseInt(env.PORT), host: '0.0.0.0' })
