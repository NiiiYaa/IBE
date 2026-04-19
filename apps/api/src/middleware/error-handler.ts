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
