/**
 * Low-level HTTP client for the HyperGuest API.
 * Handles authentication, error mapping, and request/response logging.
 * All HyperGuest API calls go through this client — nothing else touches the network.
 */

import { createGunzip } from 'zlib'
import { request } from 'undici'
import { logger } from '../../utils/logger.js'
import { getHGCredentials, type HGCredentials } from '../../services/credentials.service.js'

export class HyperGuestApiError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
    public readonly details?: unknown[],
    public readonly httpStatus?: number,
  ) {
    super(message)
    this.name = 'HyperGuestApiError'
  }
}

interface HGErrorBody {
  error: string
  errorCode: string
  errorDetails?: Array<{ message: string; field?: string; validation?: string }>
}

const BASE_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'Accept-Encoding': 'gzip, deflate',
} as const


async function parseBody<T>(bodyStream: unknown, contentEncoding?: string): Promise<T> {
  const stream = bodyStream as NodeJS.ReadableStream
  let raw: string

  if (contentEncoding?.includes('gzip')) {
    const gunzip = createGunzip()
    const chunks: Buffer[] = []
    await new Promise<void>((resolve, reject) => {
      stream.pipe(gunzip)
      gunzip.on('data', (chunk: Buffer) => chunks.push(chunk))
      gunzip.on('end', resolve)
      gunzip.on('error', reject)
    })
    raw = Buffer.concat(chunks).toString('utf8')
  } else {
    raw = await (bodyStream as { text: () => Promise<string> }).text()
  }

  if (!raw.trim()) return {} as T
  return JSON.parse(raw) as T
}

export async function hgGet<T>(url: string, credentialsOrOrgId?: HGCredentials | number): Promise<T> {
  const log = logger.child({ adapter: 'hyperguest', method: 'GET', url })
  log.debug('HyperGuest GET request')

  const { bearerToken } = typeof credentialsOrOrgId === 'object'
    ? credentialsOrOrgId
    : await getHGCredentials(credentialsOrOrgId)
  const { statusCode, body, headers } = await request(url, {
    method: 'GET',
    headers: {
      ...BASE_HEADERS,
      Authorization: `Bearer ${bearerToken}`,
    },
  })

  const data = await parseBody<T | HGErrorBody>(body, headers['content-encoding'] as string | undefined)

  if (statusCode >= 400) {
    const err = data as HGErrorBody
    log.warn({ statusCode, errorCode: err.errorCode, errorMessage: err.error, details: err.errorDetails }, 'HyperGuest GET error')
    throw new HyperGuestApiError(
      err.errorCode ?? `HTTP_${statusCode}`,
      err.error ?? 'HyperGuest request failed',
      err.errorDetails,
      statusCode,
    )
  }

  log.debug({ statusCode }, 'HyperGuest GET success')
  return data as T
}

export async function hgPost<TBody, TResponse>(url: string, body: TBody, credentialsOrOrgId?: HGCredentials | number): Promise<TResponse> {
  const log = logger.child({ adapter: 'hyperguest', method: 'POST', url })
  log.debug('HyperGuest POST request')

  const { bearerToken } = typeof credentialsOrOrgId === 'object'
    ? credentialsOrOrgId
    : await getHGCredentials(credentialsOrOrgId)
  const { statusCode, body: responseBody, headers } = await request(url, {
    method: 'POST',
    headers: {
      ...BASE_HEADERS,
      Authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify(body),
  })

  const data = await parseBody<TResponse | HGErrorBody>(responseBody, headers['content-encoding'] as string | undefined)

  if (statusCode >= 400) {
    const err = data as HGErrorBody
    log.warn({ statusCode, errorCode: err.errorCode, errorMessage: err.error, details: err.errorDetails }, 'HyperGuest POST error')
    throw new HyperGuestApiError(
      err.errorCode ?? `HTTP_${statusCode}`,
      err.error ?? 'HyperGuest request failed',
      err.errorDetails,
      statusCode,
    )
  }

  log.debug({ statusCode }, 'HyperGuest POST success')
  return data as TResponse
}
