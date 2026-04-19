import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import staticFiles from '@fastify/static'
import cors from '@fastify/cors'
import { createWriteStream, mkdirSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { pipeline } from 'node:stream/promises'

const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR ?? join(process.cwd(), '../../uploads'))
const HOST = '0.0.0.0'
const PORT = Number(process.env.PORT ?? 8888)
const BASE_URL = process.env.UPLOAD_BASE_URL ?? 'http://10.100.102.20:8888'
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB

async function start() {
  mkdirSync(UPLOAD_DIR, { recursive: true })

  const app = Fastify({ logger: true })

  await app.register(cors, { origin: true, methods: ['GET', 'POST', 'OPTIONS'] })

  await app.register(multipart, {
    limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  })

  await app.register(staticFiles, {
    root: UPLOAD_DIR,
    prefix: '/',
    decorateReply: false,
  })

  app.post('/upload', async (request, reply) => {
    const data = await request.file()
    if (!data) return reply.status(400).send({ error: 'No file provided' })

    const originalExt = extname(data.filename).toLowerCase()
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico']
    const ext = allowed.includes(originalExt) ? originalExt : '.bin'

    const filename = `${randomUUID()}${ext}`
    const filepath = join(UPLOAD_DIR, filename)

    await pipeline(data.file, createWriteStream(filepath))

    return reply.send({ url: `${BASE_URL}/${filename}` })
  })

  app.get('/health', async () => ({ status: 'ok', uploadDir: UPLOAD_DIR }))

  await app.listen({ port: PORT, host: HOST })
  console.log(`Upload server running at ${BASE_URL}`)
  console.log(`Serving files from: ${UPLOAD_DIR}`)
}

start().catch(err => {
  console.error(err)
  process.exit(1)
})
