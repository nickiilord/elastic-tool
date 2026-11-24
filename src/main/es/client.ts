import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { Auth } from '@shared/types'

export interface EsHttpOptions {
  /** 支持逗号分隔的多个节点地址，按顺序尝试。 */
  baseUrl: string
  path: string
  method: string
  auth: Auth
  rejectUnauthorized: boolean
  timeoutMs: number
  body?: unknown
  signal?: AbortSignal
}

export interface EsHttpResult {
  status: number
  statusText: string
  body: unknown
  durationMs: number
}

export class EsRequestError extends Error {
  constructor(
    message: string,
    public kind: 'network' | 'timeout' | 'canceled' | 'auth' | 'es',
    public status?: number,
    public detail?: unknown
  ) {
    super(message)
    this.name = 'EsRequestError'
  }
}

function authorizationHeader(auth: Auth): string | null {
  switch (auth.type) {
    case 'basic':
      return `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`
    case 'apiKey':
      return `ApiKey ${Buffer.from(`${auth.id}:${auth.key}`).toString('base64')}`
    case 'bearer':
      return `Bearer ${auth.token}`
    default:
      return null
  }
}

function joinPath(base: string, path: string): string {
  const trimmed = base.replace(/\/+$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${trimmed}${suffix}`
}

function attemptRequest(targetUrl: string, options: EsHttpOptions): Promise<EsHttpResult> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const target = new URL(targetUrl)
    const isHttps = target.protocol === 'https:'
    const payload = options.body === undefined ? undefined : JSON.stringify(options.body)
    const authorization = authorizationHeader(options.auth)

    let settled = false
    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      reject(error)
    }

    const requestFn = isHttps ? httpsRequest : httpRequest
    const req = requestFn(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: joinPath(target.pathname, options.path),
        method: options.method,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(authorization ? { authorization } : {}),
          ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {})
        },
        ...(isHttps ? { rejectUnauthorized: options.rejectUnauthorized } : {}),
        timeout: options.timeoutMs
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('error', fail)
        res.on('end', () => {
          if (settled) return
          settled = true
          const text = Buffer.concat(chunks).toString('utf8')
          let parsed: unknown = null
          if (text) {
            try {
              parsed = JSON.parse(text)
            } catch {
              parsed = text
            }
          }
          resolve({
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? '',
            body: parsed,
            durationMs: Date.now() - startedAt
          })
        })
      }
    )

    req.on('timeout', () => {
      req.destroy(new EsRequestError('请求超时', 'timeout'))
    })

    req.on('error', (error) => {
      const code = (error as NodeJS.ErrnoException).code
      if (error instanceof EsRequestError) {
        fail(error)
        return
      }
      if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ECONNRESET') {
        fail(new EsRequestError(`无法连接节点（${code}）`, 'network'))
        return
      }
      fail(new EsRequestError(error.message, 'network'))
    })

    const onAbort = (): void => {
      req.destroy(new EsRequestError('请求已取消', 'canceled'))
    }
    if (options.signal) {
      if (options.signal.aborted) onAbort()
      else options.signal.addEventListener('abort', onAbort, { once: true })
    }

    if (payload) req.write(payload)
    req.end()
  })
}

/**
 * 依次尝试多个节点地址：只有网络层失败或超时才切换到下一个节点，
 * 节点返回了 HTTP 响应（包括 4xx/5xx）就直接交给上层处理。
 */
export async function esHttpRequest(options: EsHttpOptions): Promise<EsHttpResult> {
  const targets = options.baseUrl
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  if (targets.length === 0) {
    throw new EsRequestError('连接地址为空', 'network')
  }

  let lastError: EsRequestError | null = null
  for (const target of targets) {
    if (options.signal?.aborted) {
      throw new EsRequestError('请求已取消', 'canceled')
    }
    try {
      return await attemptRequest(target, options)
    } catch (error) {
      lastError =
        error instanceof EsRequestError ? error : new EsRequestError(String(error), 'network')
      if (lastError.kind === 'canceled') throw lastError
      if (lastError.kind === 'network' || lastError.kind === 'timeout') continue
      throw lastError
    }
  }

  throw lastError ?? new EsRequestError('所有节点均不可用', 'network')
}
