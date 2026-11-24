import type { Connection, TestResult } from '@shared/types'
import { demoTest } from '../services/demo'
import { esHttpRequest } from './client'

/**
 * 探测连接是否可用，返回版本、集群名、节点数与握手延迟。
 * 统一走 GET /，比 /_cluster/health 多拿版本信息。
 */
export async function probeConnection(connection: Connection): Promise<TestResult> {
  if (connection.url.startsWith('demo://')) return demoTest()

  const startedAt = Date.now()
  try {
    const response = await esHttpRequest({
      baseUrl: connection.url,
      path: '/',
      method: 'GET',
      auth: connection.auth,
      rejectUnauthorized: connection.tls.rejectUnauthorized,
      timeoutMs: Math.min(connection.timeoutMs || 30_000, 15_000),
      signal: new AbortController().signal
    })
    const body = (response.body ?? {}) as {
      version?: { number?: string }
      cluster_name?: string
      number_of_nodes?: number
    }
    return {
      ok: true,
      version: body.version?.number,
      clusterName: body.cluster_name,
      nodes: body.number_of_nodes,
      latencyMs: response.durationMs
    }
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : '连接失败'
    }
  }
}
