import type {
  ClusterDiagnostics,
  EsRunRequest,
  EsRunResult,
  FieldSchema,
  IndexSchema,
  IndexSummary,
  TestResult
} from '@shared/types'
import { getOperation } from '@shared/operations'

const INDEXES: IndexSummary[] = [
  { name: 'user-logs', health: 'green', docsCount: 1_204_882, storeSizeBytes: 946 * 1024 * 1024, primaryShards: 5, replicas: 1 },
  { name: 'orders-2026.11', health: 'green', docsCount: 482_301, storeSizeBytes: 210 * 1024 * 1024, primaryShards: 3, replicas: 1 },
  { name: 'metrics-*', health: 'yellow', docsCount: 18, storeSizeBytes: 1_180 * 1024 * 1024, primaryShards: 2, replicas: 0 },
  { name: 'search-audit', health: 'green', docsCount: 9_600, storeSizeBytes: 32 * 1024 * 1024, primaryShards: 1, replicas: 0 }
]

const USER_LOGS_FIELDS: FieldSchema[] = [
  { path: '_id', type: 'keyword', aggregatable: false, searchable: true },
  { path: '@timestamp', type: 'date', aggregatable: true, searchable: true },
  { path: 'status', type: 'keyword', aggregatable: true, searchable: true, keywordSubfield: 'status.keyword' },
  {
    path: 'user',
    type: 'object',
    aggregatable: false,
    searchable: true,
    children: [
      { path: 'user.id', type: 'keyword', aggregatable: true, searchable: true },
      { path: 'user.email', type: 'text', aggregatable: false, searchable: true }
    ]
  },
  {
    path: 'message',
    type: 'text',
    aggregatable: false,
    searchable: true,
    keywordSubfield: 'message.keyword'
  },
  { path: 'latency_ms', type: 'long', aggregatable: true, searchable: true },
  { path: 'http.status', type: 'long', aggregatable: true, searchable: true },
  { path: 'tags', type: 'keyword', aggregatable: true, searchable: true },
  { path: 'location', type: 'geo_point', aggregatable: false, searchable: true }
]

const ORDERS_FIELDS: FieldSchema[] = [
  { path: '_id', type: 'keyword', aggregatable: false, searchable: true },
  { path: '@timestamp', type: 'date', aggregatable: true, searchable: true },
  { path: 'status', type: 'keyword', aggregatable: true, searchable: true },
  { path: 'user.id', type: 'keyword', aggregatable: true, searchable: true },
  { path: 'total_amount', type: 'double', aggregatable: true, searchable: true }
]

const USER_LOGS_MAPPING = {
  'user-logs': {
    mappings: {
      properties: {
        '@timestamp': { type: 'date' },
        status: { type: 'keyword' },
        user: {
          properties: {
            id: { type: 'keyword' },
            email: { type: 'text' }
          }
        },
        message: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 256 } } },
        latency_ms: { type: 'long' },
        http: { properties: { status: { type: 'long' } } },
        tags: { type: 'keyword' },
        location: { type: 'geo_point' }
      }
    }
  }
}

const SAMPLE_DOCS = [
  ['8f3a2c1e', 1.0, 'active', 'u_18428', 42, 'GET /api/v1/orders 200 in 42ms', 200, ['prod']],
  ['2b7d9a44', 1.0, 'active', 'u_20817', 128, 'POST /api/v1/orders — 201 in 128ms', 201, ['prod']],
  ['c1e4f802', 0.8, 'pending', 'u_10428', 1180, 'POST /api/v1/payments retry attempt 3', 504, ['prod', 'retry']],
  ['5a0b6d51', 1.0, 'active', 'u_51092', 36, 'GET /api/v1/cart 200 in 36ms', 200, ['prod']],
  ['9e2f7c58', 1.0, 'active', 'u_20817', 74, 'GET /api/v1/orders 200 in 74ms', 200, ['prod']],
  ['4c8d1a96', 0.6, 'pending', 'u_77401', 890, 'POST /api/v1/refunds queued', 202, ['prod', 'slow']],
  ['7b6e3f20', 1.0, 'active', 'u_51092', 51, 'DELETE /api/v1/cart/items 204', 204, ['prod']],
  ['0d5c9b7a', 1.0, 'active', 'u_33120', 51, 'GET /api/v1/search 200 in 51ms', 200, ['prod']],
  ['3c7e9a11', 0.9, 'active', 'u_44201', 210, 'GET /api/v1/catalog 200 in 210ms', 200, ['prod']],
  ['6a1f8b03', 1.0, 'active', 'u_90211', 28, 'GET /api/v1/health 200 in 28ms', 200, ['prod']],
  ['e4b2c991', 0.7, 'pending', 'u_66120', 640, 'POST /api/v1/inventory sync', 202, ['prod']],
  ['1d9f3c72', 1.0, 'active', 'u_12093', 64, 'GET /api/v1/users/me 200 in 64ms', 200, ['prod']]
] as const

function buildHits(): Array<Record<string, unknown>> {
  const base = Date.UTC(2026, 10, 20, 8, 41, 8)
  return Array.from({ length: 20 }, (_, index) => {
    const sample = SAMPLE_DOCS[index % SAMPLE_DOCS.length]
    const timestamp = new Date(base - index * 73_000).toISOString()
    return {
      _index: 'user-logs',
      _id: sample[0],
      _score: sample[1],
      _source: {
        status: sample[2],
        '@timestamp': timestamp,
        user: { id: sample[3], email: `${sample[3]}@acme.dev` },
        latency_ms: sample[4],
        message: sample[5],
        http: { status: sample[6] },
        tags: sample[7]
      }
    }
  })
}

function buildSearchBody(): Record<string, unknown> {
  const hits = buildHits()
  return {
    took: 68,
    timed_out: false,
    _shards: { total: 5, successful: 5, skipped: 0, failed: 0 },
    hits: {
      total: { value: 842_216, relation: 'eq' },
      max_score: 1.0,
      hits
    }
  }
}

function aggregateBody(): Record<string, unknown> {
  return {
    took: 24,
    timed_out: false,
    _shards: { total: 5, successful: 5, skipped: 0, failed: 0 },
    hits: { total: { value: 842_216, relation: 'eq' }, max_score: null, hits: [] },
    aggregations: {
      by_status: {
        doc_count_error_upper_bound: 0,
        sum_other_doc_count: 0,
        buckets: [
          { key: 'active', doc_count: 631_204 },
          { key: 'pending', doc_count: 209_184 },
          { key: 'error', doc_count: 1_828 }
        ]
      }
    }
  }
}

function clusterHealth(): Record<string, unknown> {
  return {
    cluster_name: 'es-prod-01',
    status: 'yellow',
    timed_out: false,
    number_of_nodes: 3,
    number_of_data_nodes: 3,
    active_primary_shards: 620,
    active_shards: 1238,
    relocating_shards: 0,
    initializing_shards: 0,
    unassigned_shards: 2,
    delayed_unassigned_shards: 0,
    number_of_pending_tasks: 0,
    number_of_in_flight_fetch: 0,
    task_max_waiting_in_queue_millis: 0,
    active_shards_percent_as_number: 99.8
  }
}

function shardsBody(): unknown[] {
  return [
    { index: 'user-logs', shard: '3', prirep: 'r', state: 'UNASSIGNED', node: null, docs: '0', store: '0b' },
    { index: 'metrics-2026.11', shard: '0', prirep: 'p', state: 'UNASSIGNED', node: null, docs: '0', store: '0b' },
    { index: 'user-logs', shard: '0', prirep: 'p', state: 'STARTED', node: 'es-node-2', docs: '241932', store: '189mb' },
    { index: 'orders-2026.11', shard: '1', prirep: 'p', state: 'STARTED', node: 'es-node-1', docs: '160433', store: '71mb' }
  ]
}

function threadPoolBody(): unknown[] {
  return [
    { node_name: 'es-node-1', name: 'search', queue: 0, rejected: 0, active: 4 },
    { node_name: 'es-node-1', name: 'write', queue: 124, rejected: 1024, active: 8 },
    { node_name: 'es-node-1', name: 'get', queue: 0, rejected: 0, active: 3 },
    { node_name: 'es-node-1', name: 'bulk', queue: 32, rejected: 18, active: 2 },
    { node_name: 'es-node-2', name: 'search', queue: 0, rejected: 0, active: 5 },
    { node_name: 'es-node-2', name: 'write', queue: 96, rejected: 812, active: 7 },
    { node_name: 'es-node-2', name: 'get', queue: 0, rejected: 0, active: 2 },
    { node_name: 'es-node-2', name: 'bulk', queue: 20, rejected: 11, active: 1 },
    { node_name: 'es-node-3', name: 'search', queue: 0, rejected: 0, active: 1 },
    { node_name: 'es-node-3', name: 'write', queue: 8, rejected: 47, active: 2 },
    { node_name: 'es-node-3', name: 'get', queue: 0, rejected: 0, active: 0 },
    { node_name: 'es-node-3', name: 'bulk', queue: 4, rejected: 3, active: 0 }
  ]
}

function allocationExplain(): Record<string, unknown> {
  return {
    index: 'user-logs',
    shard: 3,
    primary: false,
    current_state: 'unassigned',
    unassigned_info: {
      reason: 'ALLOCATION_FAILED',
      at: '2026-11-20T08:12:44.120Z',
      details:
        'no node that matches the allocation deciders: node does not match index.routing.allocation.require.tier',
      last_allocation_status: 'no_valid_shard_copy'
    },
    allocate_explanation:
      'No node fulfills the allocation filtering requirement index.routing.allocation.require.tier = hot',
    node_allocation_decisions: [
      {
        node_id: 'node-1',
        node_name: 'es-node-1',
        deciders: [
          { decider: 'filter', explanation: 'node does not match tier=hot filter' }
        ]
      },
      {
        node_id: 'node-2',
        node_name: 'es-node-2',
        deciders: [
          { decider: 'disk', explanation: 'node is above the high watermark (88%)' }
        ]
      }
    ]
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function demoRun(request: EsRunRequest): Promise<EsRunResult> {
  const op = getOperation(request.operationId)
  if (!op) throw new Error(`unknown operation: ${request.operationId}`)
  await sleep(90)

  let body: unknown = null
  let took: number | undefined
  let hits: number | undefined
  let total: number | undefined
  let shards: EsRunResult['shards']

  switch (op.id) {
    case 'search': {
      body = buildSearchBody()
      const parsed = body as {
        took: number
        hits: { total: { value: number }; hits: unknown[] }
        _shards: { total: number; successful: number; failed: number }
      }
      took = parsed.took
      hits = parsed.hits.hits.length
      total = parsed.hits.total.value
      shards = parsed._shards
      break
    }
    case 'agg': {
      body = aggregateBody()
      const parsed = body as {
        took: number
        hits: { total: { value: number } }
        _shards: { total: number; successful: number; failed: number }
      }
      took = parsed.took
      total = parsed.hits.total.value
      shards = parsed._shards
      break
    }
    case 'count': {
      body = { count: 842_216, _shards: { total: 5, successful: 5, failed: 0 } }
      total = 842_216
      shards = { total: 5, successful: 5, failed: 0 }
      break
    }
    case 'get-doc':
      body = {
        _index: request.index ?? 'user-logs',
        _id: request.params?.docId ?? '8f3a2c1e',
        found: true,
        _source: (buildHits()[0] as { _source: unknown })._source
      }
      break
    case 'mapping':
      body = USER_LOGS_MAPPING
      break
    case 'index-stats':
      body = {
        indices: {
          'user-logs': {
            primaries: { docs: { count: 620_442, deleted: 0 }, store: { size_in_bytes: 482_923_221 } },
            total: { docs: { count: 1_204_882, deleted: 0 }, store: { size_in_bytes: 946_211_882 } }
          }
        }
      }
      break
    case 'shards':
      body = shardsBody()
      break
    case 'cluster-health':
      body = clusterHealth()
      break
    case 'allocation-explain':
      body = allocationExplain()
      break
    case 'thread-pool':
      body = threadPoolBody()
      break
    default:
      body = { acknowledged: true }
  }

  return {
    requestId: request.requestId,
    status: 200,
    statusText: 'OK',
    durationMs: 90,
    took,
    hits,
    total,
    shards,
    body
  }
}

export function demoIndices(): IndexSummary[] {
  return INDEXES
}

export function demoSchema(index: string): IndexSchema {
  const fields =
    index === 'orders-2026.11' ? ORDERS_FIELDS : index === 'user-logs' ? USER_LOGS_FIELDS : ORDERS_FIELDS
  return {
    index,
    fields,
    docCount: INDEXES.find((entry) => entry.name === index)?.docsCount ?? 482_301,
    cachedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    mappingRaw: index === 'user-logs' ? USER_LOGS_MAPPING : { [index]: { mappings: {} } }
  }
}

export function demoDiagnostics(): ClusterDiagnostics {
  return {
    fetchedAt: new Date().toISOString(),
    health: { status: 'yellow', unassignedShards: 2, indices: 5 },
    nodes: { total: 3, online: 3, dedicatedMasters: 1 },
    shards: { total: 1240, primary: 620, replica: 618, unassigned: 2 },
    disk: { highestPercent: 88, node: 'es-node-2', watermarkPercent: 85 },
    threadPoolRejections: { total: 1024, pool: 'write', window: '近 1 小时' },
    unassigned: [
      {
        index: 'user-logs',
        shard: 3,
        role: 'r',
        node: 'es-node-2',
        reason: '没有节点满足分配过滤条件 index.routing.allocation.require.tier = hot',
        suggestion: '确认节点属性 tier=hot 是否仍存在，不需要该过滤时移除它，分片会自动分配回。'
      },
      {
        index: 'metrics-2026.11',
        shard: 0,
        role: 'p',
        node: 'es-node-2',
        reason: '节点磁盘使用率 88%，高于 85% 高水位线，分片被强制迁出后无处可去',
        suggestion: '清理 30 天前索引或扩容磁盘，然后 POST /_cluster/reroute?retry_failed=true。'
      }
    ],
    threadPools: [
      { name: 'search', queue: 0, rejected: 0, active: 10 },
      { name: 'write', queue: 228, rejected: 1024, active: 17 },
      { name: 'get', queue: 0, rejected: 0, active: 5 },
      { name: 'bulk', queue: 56, rejected: 32, active: 3 }
    ],
    nodeStats: [
      { name: 'es-node-1', roles: ['data', 'ingest'], cpuPercent: 32, heapPercent: 58, diskPercent: 71, assignedShards: 412, diskWatermarkExceeded: false },
      { name: 'es-node-2', roles: ['data', 'ingest'], cpuPercent: 41, heapPercent: 64, diskPercent: 88, assignedShards: 406, diskWatermarkExceeded: true },
      { name: 'es-node-3', roles: ['data', 'master'], cpuPercent: 28, heapPercent: 51, diskPercent: 63, assignedShards: 420, diskWatermarkExceeded: false }
    ],
    segments: { count: 1842, mergesInProgress: 3 },
    queryCacheHitPercent: 12.4,
    fielddataBytes: 428 * 1024 * 1024
  }
}

export function demoHotThreads(): string {
  return [
    '::: {es-node-2}{Zk1Qx}',
    '   Hot threads at 2026-11-20T08:45:12.331Z, interval=500ms, busiestThreads=3, ignoreIdleThreads=true:',
    '',
    '   76.8% (384ms out of 500ms) cpu usage by thread \'elasticsearch[es-node-2][write][T#4]\'',
    '     10/10 snapshots sharing following 8 elements',
    '       org.elasticsearch.index.engine.InternalEngine.merge',
    '       org.elasticsearch.index.shard.IndexShard.merge',
    '       org.elasticsearch.action.bulk.TransportBulkAction',
    '',
    '   12.4% (62ms out of 500ms) cpu usage by thread \'elasticsearch[es-node-2][search][T#2]\'',
    '       org.elasticsearch.search.query.QueryPhase.execute',
    '       org.elasticsearch.search.DefaultSearchContext'
  ].join('\n')
}

export function demoTest(): TestResult {
  return {
    ok: true,
    version: '8.13.2',
    clusterName: 'es-prod-01',
    nodes: 3,
    latencyMs: 24
  }
}
