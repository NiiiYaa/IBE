import { buildApp } from './app.js'
import { env } from './env.js'
import { prisma } from './db/client.js'

const app = await buildApp()

const shutdown = async () => {
  await app.close()
  await prisma.$disconnect()
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown())
process.on('SIGINT', () => void shutdown())

await app.listen({ port: parseInt(env.PORT), host: '0.0.0.0' })
