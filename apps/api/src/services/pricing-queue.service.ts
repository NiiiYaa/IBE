import { Queue, Worker, type Job } from 'bullmq'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { collectHotelPrices } from './pricing-collect.service.js'
import { classifyDailyRates } from './pricing-classify.service.js'

export interface PricingJobData {
  propertyId: number
  triggeredBy: 'cron' | 'manual'
}

const CONNECTION = { url: env.REDIS_URL ?? 'redis://localhost:6379' }

let _queue: Queue<PricingJobData> | null = null
let _worker: Worker<PricingJobData> | null = null

function getQueue(): Queue<PricingJobData> {
  if (!_queue) {
    _queue = new Queue<PricingJobData>('pricing', { connection: CONNECTION })
  }
  return _queue
}

export async function enqueuePricingJob(propertyId: number, triggeredBy: 'cron' | 'manual'): Promise<'queued' | 'already_running'> {
  const queue = getQueue()
  const [active, waiting] = await Promise.all([queue.getActive(), queue.getWaiting()])
  const alreadyQueued = [...active, ...waiting].some(j => j.data.propertyId === propertyId)
  if (alreadyQueued) return 'already_running'

  const priority = triggeredBy === 'manual' ? 1 : 10
  await queue.add('collect-hotel-prices', { propertyId, triggeredBy }, { priority })
  return 'queued'
}

export async function getPricingJobStatus(propertyId: number): Promise<'idle' | 'queued' | 'running'> {
  try {
    const queue = getQueue()
    const [active, waiting] = await Promise.race([
      Promise.all([queue.getActive(), queue.getWaiting()]),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ])
    if (active.some(j => j.data.propertyId === propertyId)) return 'running'
    if (waiting.some(j => j.data.propertyId === propertyId)) return 'queued'
    return 'idle'
  } catch {
    return 'idle'
  }
}

export function startPricingWorker(): Worker<PricingJobData> {
  if (!_worker) {
    _worker = new Worker<PricingJobData>(
      'pricing',
      async (job: Job<PricingJobData>) => {
        const { propertyId } = job.data
        logger.info({ propertyId }, '[Pricing] Job started')
        await collectHotelPrices(propertyId)
        await classifyDailyRates(propertyId)
        // Invalidate all currency variants of this property's calendar cache
        const { getRedis } = await import('../utils/redis.js')
        const redis = getRedis()
        const keys = await redis.keys(`pricing:calendar:${propertyId}:*`)
        if (keys.length > 0) await redis.del(...keys)
        logger.info({ propertyId }, '[Pricing] Job complete')
      },
      { connection: CONNECTION, concurrency: 2 },
    )

    _worker.on('failed', (job, err) => {
      logger.warn({ jobId: job?.id, propertyId: job?.data.propertyId, err }, '[Pricing] Job failed')
    })
  }
  return _worker
}

export async function closePricingQueue(): Promise<void> {
  await _worker?.close()
  await _queue?.close()
  _worker = null
  _queue = null
}
