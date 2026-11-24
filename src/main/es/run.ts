import type { Connection, EsErrorPayload, EsRunRequest, EsRunResult } from '@shared/types'
import { buildPath, getOperation } from '@shared/operations'
import { demoRun } from '../services/demo'
import { EsRequestError, esHttpRequest } from './client'

export class EsRunError extends Error {
  constructor(public payload: EsErrorPayload) {
    super(payload.message)
    this.name = 'EsRunError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readMeta(body: unknown): Pick<EsRunResult, 'took' | 'hits' | 'total' | 'shards'> {
  if (!isRecord(body)) return {}
  const out: Pick<EsRunResult, 'took' | 'hits' | 'total' | 'shards'> = {}

  if (typeof body.took === 'number') out.took = body.took

  if (isRecord(body.hits)) {
    const container = body.hits
    if (Array.isArray(container.hits)) out.hits = container.hits.length
    if (isRecord(container.total) && typeof container.total.value === 'number') {
      out.total = container.total.value
    } else if (typeof container.total === 'number') {
      out.total = container.total
    }
  }

  if (isRecord(body._shards)) {
    const shards = body._shards
    out.shards = {
      total: Number(shards.total ?? 0),
      successful: Number(shards.successful ?? 0),
      failed: Number(shards.failed ?? 0)
    }
  }

  return out
}

function toEsError(error: unknown): EsRunError {
  if (error instanceof EsRunError) return error
  if (error instanceof EsRequestError) {
    if (error.kind === 'timeout') {
      return new EsRunError({ code: 'timeout', message: '请求超时，节点在限定时间内没有响应。' })
    }
    if (error.kind === 'canceled') {
      return new EsRunError({ code: 'canceled', message: '请求已取消。' })
    }
    return new EsRunError({ code: 'network', message: error.message })
  }
  return new EsRunError({
    code: 'network',
    message: error instanceof Error ? error.message : '未知错误'
  })
}

function esErrorFromResponse(
  status: number,
  body: unknown
): EsRunError {
  const reason = isRecord(body) && isRecord(body.error) ? body.error : null
  const type = reason && typeof reason.type === 'string' ? reason.type : undefined
  const detail = reason && typeof reason.reason === 'string' ? reason.reason : undefined
  const message = detail ?? `Elasticsearch 返回 ${status}`

  if (status === 401 || status === 403) {
    return new EsRunError({
      code: 'auth',
      message: '认证失败或权限不足，检查连接凭证与只读设置。',
      status,
      type,
      reason: detail,
      body
    })
  }

  return new EsRunError({ code: 'es', message, status, type, reason: detail, body })
}

export async function runOperation(
  connection: Connection,
  request: EsRunRequest,
  signal: AbortSignal
): Promise<EsRunResult> {
  const operation = getOperation(request.operationId)
  if (!operation) {
    throw new EsRunError({ code: 'validation', message: '未知操作' })
  }

  if (connection.readOnly && operation.write) {
    throw new EsRunError({
      code: 'readonly',
      message: '当前连接是只读模式，写入类操作已被拦截。'
    })
  }

  if (connection.url.startsWith('demo://')) {
    return demoRun(request)
  }

  const path = buildPath(operation, {
    index: request.index,
    docId: request.params?.docId
  })
  const body = operation.bodyKind === 'none' ? undefined : request.dsl ?? undefined

  try {
    const response = await esHttpRequest({
      baseUrl: connection.url,
      path,
      method: operation.method,
      auth: connection.auth,
      rejectUnauthorized: connection.tls.rejectUnauthorized,
      timeoutMs: connection.timeoutMs,
      body,
      signal
    })

    if (response.status < 200 || response.status >= 300) {
      throw esErrorFromResponse(response.status, response.body)
    }

    return {
      requestId: request.requestId,
      status: response.status,
      statusText: response.statusText,
      durationMs: response.durationMs,
      ...readMeta(response.body),
      body: response.body
    }
  } catch (error) {
    throw toEsError(error)
  }
}
