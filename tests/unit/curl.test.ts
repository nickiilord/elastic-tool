import { describe, expect, it } from 'vitest'
import type { Connection } from '@shared/types'
import { buildCurl } from '../../src/main/es/curl'

function connection(patch: Partial<Connection> = {}): Connection {
  return {
    id: 'c1',
    name: 'local',
    url: 'http://127.0.0.1:9200',
    environment: 'dev',
    readOnly: true,
    auth: { type: 'none' },
    tls: { rejectUnauthorized: true },
    timeoutMs: 30_000,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch
  }
}

describe('buildCurl', () => {
  it('生成带 body 的搜索请求', () => {
    const curl = buildCurl({
      connection: connection(),
      operationId: 'search',
      index: 'logs',
      dsl: { size: 20, track_total_hits: true }
    })
    expect(curl).toBe(
      'curl -X POST "http://127.0.0.1:9200/logs/_search" -H "Content-Type: application/json" -d "{\\"size\\":20,\\"track_total_hits\\":true}"'
    )
  })

  it('basic 认证用 -u，自签证书加 -k', () => {
    const curl = buildCurl({
      connection: connection({
        url: 'https://es.example:9200/',
        auth: { type: 'basic', username: 'elastic', password: 'p@ss' },
        tls: { rejectUnauthorized: false }
      }),
      operationId: 'cluster-health',
      index: null,
      dsl: null
    })
    expect(curl).toBe(
      'curl -X GET "https://es.example:9200/_cluster/health" -k -u "elastic:p@ss"'
    )
  })

  it('API Key 认证编码成 ApiKey 头', () => {
    const curl = buildCurl({
      connection: connection({ auth: { type: 'apiKey', id: 'kid', key: 'secret' } }),
      operationId: 'count',
      index: 'logs',
      dsl: { query: { match_all: {} } }
    })
    expect(curl).toContain('-H "Authorization: ApiKey a2lkOnNlY3JldA=="')
    expect(curl).toContain('/logs/_count')
  })

  it('GET 操作不附加 body', () => {
    const curl = buildCurl({
      connection: connection(),
      operationId: 'mapping',
      index: 'logs',
      dsl: { size: 20 }
    })
    expect(curl).toBe('curl -X GET "http://127.0.0.1:9200/logs/_mapping"')
  })
})
