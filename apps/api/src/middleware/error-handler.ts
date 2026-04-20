/**
 * Global error handler for the Fastify server.
 * Maps known errors to structured responses; unknown errors become 500s.
 */

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { IBE_ERROR_INTERNAL } from '@ibe/shared'
import { logger } from '../utils/logger.js'

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  // Fastify validation errors
  if (error.statusCode === 400 && error.validation) {
    void reply.status(400).send({
      error: 'Validation failed',
      code: 'IBE.VALIDATION.001',
      details: error.validation,
    })
    return
  }

  // Known HTTP errors (from fastify-sensible, etc.)
  if (error.statusCode && error.statusCode < 500) {
    void reply.status(error.statusCode).send({
      error: error.message,
      code: error.code ?? `HTTP_${error.statusCode}`,
    })
    return
  }

  // Prisma / DB connection errors → 503 so the client can retry.
  // Prisma uses Unicode smart apostrophe (U+2019) in "Can\u2019t reach database server"
  // so we match on the apostrophe-free substring.
  const msg = error.message ?? ''
  const errAny = error as unknown as { code?: string; errorCode?: string }
  if (
    msg.includes('reach database server') ||
    msg.includes('Server has closed the connection') ||
    msg.includes('Connection timed out') ||
    msg.includes('connection is closed') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ENOTFOUND') ||
    errAny.errorCode === 'P1001' ||
    errAny.errorCode === 'P1002' ||
    errAny.code === 'P1001' ||
    errAny.code === 'P1017'
  ) {
    void reply.status(503).send({
      error: 'Database temporarily unavailable, please retry',
      code: 'DB_UNAVAILABLE',
    })
    return
  }

  // Unexpected errors
  logger.error(
    { err: error, url: request.url, method: request.method },
    'Unhandled server error',
  )

  void reply.status(500).send({
    error: 'An unexpected error occurred',
    code: IBE_ERROR_INTERNAL,
  })
}
