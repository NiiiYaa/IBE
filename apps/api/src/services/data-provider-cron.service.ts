import cron from 'node-cron'
import { logger } from '../utils/logger.js'
import { env } from '../config/env.js'
import { refreshDueProperties } from './data-provider-fetch.service.js'
import { getSystemConfig } from './data-provider.service.js'

let _task: ReturnType<typeof cron.schedule> | undefined

export function startDataProviderCron(): void {
  const schedule = env.DATA_PROVIDER_CRON

  if (!cron.validate(schedule)) {
    logger.warn({ schedule }, '[DataProvider] Invalid cron expression, skipping cron setup')
    return
  }

  _task = cron.schedule(schedule, async () => {
    try {
      const config = await getSystemConfig()
      if (!config.enabled) {
        logger.debug('[DataProvider] Cron fired but system config has enabled=false, skipping')
        return
      }
      logger.info('[DataProvider] Cron triggered refresh run')
      await refreshDueProperties()
    } catch (err) {
      logger.warn({ err }, '[DataProvider] Cron refresh failed (non-fatal)')
    }
  }, { noOverlap: true })

  logger.info({ schedule }, '[DataProvider] Cron scheduled')
}

export function stopDataProviderCron(): void {
  _task?.stop()
}
