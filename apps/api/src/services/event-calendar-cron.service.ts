import cron from 'node-cron'
import { logger } from '../utils/logger.js'
import { getSystemEventCalendarConfig, getActiveEventPropertyIds } from './event-calendar.service.js'
import { refreshPropertyEvents } from './event-calendar-fetch.service.js'

let _task: ReturnType<typeof cron.schedule> | undefined

export function startEventCalendarCron(): void {
  const DEFAULT_SCHEDULE = '0 4 * * *'

  getSystemEventCalendarConfig().then(config => {
    const schedule = config.cronSchedule || DEFAULT_SCHEDULE

    if (!cron.validate(schedule)) {
      logger.warn({ schedule }, '[EventCalendar] Invalid cron expression, skipping cron setup')
      return
    }

    _task = cron.schedule(schedule, async () => {
      try {
        const currentConfig = await getSystemEventCalendarConfig()
        if (!currentConfig.enabled) {
          logger.debug('[EventCalendar] Cron fired but system config has enabled=false, skipping')
          return
        }
        const propertyIds = await getActiveEventPropertyIds()
        logger.info({ count: propertyIds.length }, '[EventCalendar] Cron starting refresh for properties')
        const today = new Date()
        const periodStart = today.toISOString().split('T')[0]!
        const end = new Date(today)
        end.setDate(end.getDate() + 30)
        const periodEnd = end.toISOString().split('T')[0]!
        for (const propertyId of propertyIds) {
          await refreshPropertyEvents(propertyId, periodStart, periodEnd).catch(err =>
            logger.warn({ err, propertyId }, '[EventCalendar] Refresh failed for property (non-fatal)'),
          )
        }
      } catch (err) {
        logger.warn({ err }, '[EventCalendar] Cron run failed (non-fatal)')
      }
    }, { noOverlap: true })

    logger.info({ schedule }, '[EventCalendar] Cron scheduled')
  }).catch(err => {
    logger.warn({ err }, '[EventCalendar] Failed to read config for cron setup (non-fatal)')
  })
}

export function stopEventCalendarCron(): void {
  _task?.stop()
}
