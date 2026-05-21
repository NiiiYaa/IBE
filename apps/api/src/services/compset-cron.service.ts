import cron from 'node-cron'
import { logger } from '../utils/logger.js'
import { getSystemCompSetConfig, getActivePropertyIds } from './compset.service.js'
import { runPropertyCompSet } from './compset-collect.service.js'

let _task: ReturnType<typeof cron.schedule> | undefined

export function startCompSetCron(): void {
  const schedule = '0 3 * * *'

  if (!cron.validate(schedule)) {
    logger.warn({ schedule }, '[CompSet] Invalid cron expression, skipping cron setup')
    return
  }

  _task = cron.schedule(schedule, async () => {
    try {
      const config = await getSystemCompSetConfig()
      if (!config.enabled) {
        logger.debug('[CompSet] Cron fired but system config has enabled=false, skipping')
        return
      }
      const propertyIds = await getActivePropertyIds()
      logger.info({ count: propertyIds.length }, '[CompSet] Cron starting collection for properties')
      for (const propertyId of propertyIds) {
        await runPropertyCompSet(propertyId).catch(err =>
          logger.warn({ err, propertyId }, '[CompSet] Collection failed for property (non-fatal)'),
        )
      }
    } catch (err) {
      logger.warn({ err }, '[CompSet] Cron run failed (non-fatal)')
    }
  }, { noOverlap: true })

  logger.info({ schedule }, '[CompSet] Cron scheduled')
}

export function stopCompSetCron(): void {
  _task?.stop()
}
