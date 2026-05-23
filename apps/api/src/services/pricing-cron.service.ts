import cron from 'node-cron'
import { logger } from '../utils/logger.js'
import { getSystemPricingConfig, getEnabledPropertyIds } from './pricing-config.service.js'
import { enqueuePricingJob } from './pricing-queue.service.js'

let _task: ReturnType<typeof cron.schedule> | undefined

export function startPricingCron(): void {
  if (process.env['NODE_ENV'] !== 'production') {
    logger.info('[Pricing] Cron disabled in non-production environment')
    return
  }

  const schedule = '0 * * * *' // every hour at :00

  if (!cron.validate(schedule)) {
    logger.warn({ schedule }, '[Pricing] Invalid cron expression, skipping')
    return
  }

  _task = cron.schedule(schedule, async () => {
    try {
      const config = await getSystemPricingConfig()
      if (!config.enabled) {
        logger.debug('[Pricing] Cron fired but system pricing is disabled, skipping')
        return
      }
      const hour = new Date().getUTCHours()
      if (hour % config.refreshIntervalHours !== 0) return
      const propertyIds = await getEnabledPropertyIds()
      logger.info({ count: propertyIds.length }, '[Pricing] Cron enqueuing jobs')
      for (const propertyId of propertyIds) {
        await enqueuePricingJob(propertyId, 'cron').catch(err =>
          logger.warn({ err, propertyId }, '[Pricing] Failed to enqueue cron job (non-fatal)'),
        )
      }
    } catch (err) {
      logger.warn({ err }, '[Pricing] Cron run failed (non-fatal)')
    }
  }, { noOverlap: true })

  logger.info({ schedule }, '[Pricing] Cron scheduled')
}

export function stopPricingCron(): void {
  _task?.stop()
}
