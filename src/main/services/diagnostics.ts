import type { ClusterDiagnostics, Connection } from '@shared/types'
import { esHttpRequest } from '../es/client'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function getJson(
  connection: Connection,
  path: string,
  signal: AbortSignal
): Promise<unknown | null> {
  try {
    const response = await esHttpRequest({
      baseUrl: connection.url,
      path,
      method: 'GET',
      auth: connection.auth,
      rejectUnauthorized: connection.tls.rejectUnauthorized,
      timeoutMs: connection.timeoutMs,
      signal
    })
    if (response.status >= 200 && response.status < 300) return response.body
    return null
  } catch {
    return null
  }
}

function percentFromBytes(available: unknown, total: unknown): number {
  const avail = Number(available)
  const size = Number(total)
  if (!Number.isFinite(avail) || !Number.isFinite(size) || size <= 0) return 0
  return Math.round((1 - avail / size) * 100)
}

export async function collectDiagnostics(connection: Connection): Promise<ClusterDiagnostics> {
  const signal = new AbortController().signal

  const [healthRaw, explainRaw, threadPoolRaw, nodesRaw, allocationRaw, settingsRaw, catIndicesRaw] =
    await Promise.all([
      getJson(connection, '/_cluster/health', signal),
      getJson(connection, '/_cluster/allocation/explain', signal),
      getJson(connection, '/_cat/thread_pool?format=json', signal),
      getJson(
        connection,
        '/_nodes/stats/os,process,jvm,fs,indices',
        signal
      ),
      getJson(connection, '/_cat/allocation?format=json', signal),
      getJson(connection, '/_cluster/settings', signal),
      getJson(connection, '/_cat/indices?format=json&h=index', signal)
    ])

  const health = isRecord(healthRaw) ? healthRaw : {}
  const nodeStatsRaw = isRecord(nodesRaw) && isRecord(nodesRaw.nodes) ? nodesRaw.nodes : {}
  const nodeEntries = Object.entries(nodeStatsRaw).map(([id, value]) => ({
    id,
    data: isRecord(value) ? value : {}
  }))
  const allocationRows = Array.isArray(allocationRaw) ? allocationRaw : []
  const threadPoolRows = Array.isArray(threadPoolRaw) ? threadPoolRaw : []
  const catIndices = Array.isArray(catIndicesRaw) ? catIndicesRaw : []

  const diskByNode = new Map<string, number>()
  const shardsByNode = new Map<string, number>()
  for (const row of allocationRows) {
    if (!isRecord(row)) continue
    const node = String(row.node ?? '')
    const disk = Number(row['disk.percent'] ?? 0)
    const shards = Number(row.shards ?? 0)
    if (node) {
      diskByNode.set(node, Number.isFinite(disk) ? disk : 0)
      shardsByNode.set(node, Number.isFinite(shards) ? shards : 0)
    }
  }

  const nodeStats = nodeEntries.map(({ data }) => {
    const name = String(data.name ?? 'node')
    const roles = Array.isArray(data.roles) ? data.roles.map(String) : []
    const os = isRecord(data.os) ? data.os : {}
    const cpu = isRecord(os.cpu) ? os.cpu : {}
    const jvm = isRecord(data.jvm) ? data.jvm : {}
    const mem = isRecord(jvm.mem) ? jvm.mem : {}
    const fs = isRecord(data.fs) ? data.fs : {}
    const total = isRecord(fs.total) ? fs.total : {}
    const diskPercent =
      diskByNode.get(name) ?? percentFromBytes(total.available_in_bytes, total.total_in_bytes)
    const assignedShards = shardsByNode.get(name) ?? 0

    return {
      name,
      roles,
      cpuPercent: Math.round(Number(cpu.percent ?? 0)),
      heapPercent: Math.round(Number(mem.heap_used_percent ?? 0)),
      diskPercent,
      assignedShards,
      diskWatermarkExceeded: false
    }
  })

  const highestDisk = nodeStats.reduce(
    (best, node) => (node.diskPercent > best.diskPercent ? node : best),
    { name: '-', diskPercent: 0 }
  )

  const watermarkSetting = (() => {
    if (!isRecord(settingsRaw)) return 85
    const candidates = [settingsRaw.persistent, settingsRaw.transient]
    for (const scope of candidates) {
      if (!isRecord(scope)) continue
      const raw = scope['cluster.routing.allocation.disk.watermark.high']
      if (typeof raw === 'string') {
        const parsed = Number(raw.replace('%', ''))
        if (Number.isFinite(parsed)) return parsed
      }
    }
    return 85
  })()

  for (const node of nodeStats) {
    node.diskWatermarkExceeded = node.diskPercent >= watermarkSetting
  }

  const KEY_POOLS = new Set(['search', 'write', 'get', 'bulk'])

  const pools = new Map<string, { queue: number; rejected: number; active: number }>()
  for (const row of threadPoolRows) {
    if (!isRecord(row)) continue
    const name = String(row.name ?? '')
    if (!name) continue
    const current = pools.get(name) ?? { queue: 0, rejected: 0, active: 0 }
    current.queue += Number(row.queue ?? 0)
    current.rejected += Number(row.rejected ?? 0)
    current.active += Number(row.active ?? 0)
    pools.set(name, current)
  }
  const threadPools = [...pools.entries()]
    .map(([name, value]) => ({ name, ...value }))
    .filter((pool) => KEY_POOLS.has(pool.name) || pool.rejected > 0 || pool.queue > 0)
    .sort((a, b) => b.rejected - a.rejected || b.queue - a.queue || a.name.localeCompare(b.name))
    .slice(0, 8)
  const worstPool = threadPools.reduce(
    (worst, pool) => (pool.rejected > worst.rejected ? pool : worst),
    { name: '-', rejected: 0, queue: 0, active: 0 }
  )

  const unassigned = buildUnassigned(explainRaw)

  let segmentCount = 0
  let mergesInProgress = 0
  let queryHits = 0
  let queryMisses = 0
  let fielddataBytes = 0
  for (const { data } of nodeEntries) {
    const indices = isRecord(data.indices) ? data.indices : {}
    const segments = isRecord(indices.segments) ? indices.segments : {}
    const merges = isRecord(indices.merges) ? indices.merges : {}
    const queryCache = isRecord(indices.query_cache) ? indices.query_cache : {}
    const fielddata = isRecord(indices.fielddata) ? indices.fielddata : {}
    segmentCount += Number(segments.count ?? 0)
    mergesInProgress += Number(merges.current ?? 0)
    queryHits += Number(queryCache.hit_count ?? 0)
    queryMisses += Number(queryCache.miss_count ?? 0)
    fielddataBytes += Number(fielddata.memory_size_in_bytes ?? 0)
  }
  const cacheTotal = queryHits + queryMisses

  return {
    fetchedAt: new Date().toISOString(),
    health: {
      status: (health.status as ClusterDiagnostics['health']['status']) ?? 'green',
      unassignedShards: Number(health.unassigned_shards ?? 0),
      indices: catIndices.length
    },
    nodes: {
      total: nodeEntries.length,
      online: nodeEntries.length,
      dedicatedMasters: nodeStats.filter(
        (node) => node.roles.includes('master') && !node.roles.includes('data')
      ).length
    },
    shards: {
      total: Number(health.active_shards ?? 0) + Number(health.unassigned_shards ?? 0),
      primary: Number(health.active_primary_shards ?? 0),
      replica:
        Number(health.active_shards ?? 0) - Number(health.active_primary_shards ?? 0),
      unassigned: Number(health.unassigned_shards ?? 0)
    },
    disk: {
      highestPercent: highestDisk.diskPercent,
      node: highestDisk.name,
      watermarkPercent: watermarkSetting
    },
    threadPoolRejections: {
      total: worstPool.rejected,
      pool: worstPool.name,
      window: '近 1 小时'
    },
    unassigned,
    threadPools,
    nodeStats,
    segments: { count: segmentCount, mergesInProgress },
    queryCacheHitPercent: cacheTotal > 0 ? Number(((queryHits / cacheTotal) * 100).toFixed(1)) : 0,
    fielddataBytes
  }
}

function buildUnassigned(
  explainRaw: unknown
): ClusterDiagnostics['unassigned'] {
  if (!isRecord(explainRaw)) return []
  const index = String(explainRaw.index ?? '')
  if (!index) return []
  const explanation =
    typeof explainRaw.allocate_explanation === 'string'
      ? explainRaw.allocate_explanation
      : '无法分配，原因见 allocation explain'
  const decisions = Array.isArray(explainRaw.node_allocation_decisions)
    ? explainRaw.node_allocation_decisions
    : []
  const firstDecision = decisions.find((entry) => isRecord(entry) && entry.node_name)
  const node =
    isRecord(firstDecision) && typeof firstDecision.node_name === 'string'
      ? firstDecision.node_name
      : '-'
  return [
    {
      index,
      shard: Number(explainRaw.shard ?? 0),
      role: explainRaw.primary === true ? 'p' : 'r',
      node,
      reason: explanation,
      suggestion: '检查节点属性、磁盘水位与分片分配设置后，执行 POST /_cluster/reroute?retry_failed=true。'
    }
  ]
}
