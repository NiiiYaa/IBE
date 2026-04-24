import pino from 'pino'
import { env } from '../config/env.js'

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  ...(env.NODE_ENV !== 'production'
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }
    : {}),
  redact: {
    // Never log sensitive fields
    paths: [
      'paymentDetails.details.number',
      'paymentDetails.details.cvv',
      'paymentDetails.details.expiry',
      '*.creditCard',
      'req.headers.authorization',
    ],
    censor: '[REDACTED]',
  },
})
