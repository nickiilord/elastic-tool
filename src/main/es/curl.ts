import type { Auth, Connection } from '@shared/types'
import { buildPath, getOperation } from '@shared/operations'

export interface CurlRequest {
  connection: Connection
  operationId: string
  index: string | null
  dsl: Record<string, unknown> | null
  docId?: string
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`
}

function authArgs(auth: Auth): string[] {
  switch (auth.type) {
    case 'basic':
      return ['-u', quote(`${auth.username}:${auth.password}`)]
    case 'apiKey': {
      const token = Buffer.from(`${auth.id}:${auth.key}`, 'utf8').toString('base64')
      return ['-H', quote(`Authorization: ApiKey ${token}`)]
    }
    case 'bearer':
      return ['-H', quote(`Authorization: Bearer ${auth.token}`)]
    default:
      return []
  }
}

/**
 * 按连接与操作生成一条可直接粘贴执行的 curl 命令，与 runOperation 走同一套 method / path 推导。
 */
export function buildCurl(request: CurlRequest): string {
  const operation = getOperation(request.operationId)
  if (!operation) throw new Error('未知操作')

  const path = buildPath(operation, { index: request.index, docId: request.docId })
  const baseUrl = request.connection.url.replace(/\/+$/, '')
  const parts = ['curl', '-X', operation.method, quote(`${baseUrl}${path}`)]

  if (!request.connection.tls.rejectUnauthorized) parts.push('-k')
  parts.push(...authArgs(request.connection.auth))

  if (operation.bodyKind !== 'none' && request.dsl) {
    parts.push('-H', quote('Content-Type: application/json'))
    parts.push('-d', quote(JSON.stringify(request.dsl)))
  }

  return parts.join(' ')
}
