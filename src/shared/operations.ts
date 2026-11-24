export type OperationId =
  | 'search'
  | 'agg'
  | 'count'
  | 'get-doc'
  | 'mapping'
  | 'index-stats'
  | 'shards'
  | 'cluster-health'
  | 'allocation-explain'
  | 'thread-pool'
  | 'index-doc'
  | 'update-doc'
  | 'delete-doc'

export type ResultView = 'table' | 'json' | 'aggs' | 'value' | 'mapping'

export interface OperationDef {
  id: OperationId
  label: string
  group: '搜索与聚合' | '索引' | '集群' | '写入'
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  requiresIndex: boolean
  requiresDocId?: boolean
  write: boolean
  bodyKind: 'query' | 'aggs' | 'none'
  resultView: ResultView
}

const OPERATIONS: OperationDef[] = [
  {
    id: 'search',
    label: '搜索文档',
    group: '搜索与聚合',
    method: 'POST',
    path: '/{index}/_search',
    requiresIndex: true,
    write: false,
    bodyKind: 'query',
    resultView: 'table'
  },
  {
    id: 'agg',
    label: '聚合统计',
    group: '搜索与聚合',
    method: 'POST',
    path: '/{index}/_search',
    requiresIndex: true,
    write: false,
    bodyKind: 'aggs',
    resultView: 'aggs'
  },
  {
    id: 'count',
    label: '计数',
    group: '搜索与聚合',
    method: 'POST',
    path: '/{index}/_count',
    requiresIndex: true,
    write: false,
    bodyKind: 'query',
    resultView: 'value'
  },
  {
    id: 'get-doc',
    label: '按 ID 取文档',
    group: '搜索与聚合',
    method: 'GET',
    path: '/{index}/_doc/{docId}',
    requiresIndex: true,
    requiresDocId: true,
    write: false,
    bodyKind: 'none',
    resultView: 'json'
  },
  {
    id: 'mapping',
    label: '浏览 mapping',
    group: '索引',
    method: 'GET',
    path: '/{index}/_mapping',
    requiresIndex: true,
    write: false,
    bodyKind: 'none',
    resultView: 'mapping'
  },
  {
    id: 'index-stats',
    label: '索引统计',
    group: '索引',
    method: 'GET',
    path: '/{index}/_stats',
    requiresIndex: true,
    write: false,
    bodyKind: 'none',
    resultView: 'json'
  },
  {
    id: 'shards',
    label: '分片分布',
    group: '索引',
    method: 'GET',
    path: '/_cat/shards/{index}',
    requiresIndex: true,
    write: false,
    bodyKind: 'none',
    resultView: 'table'
  },
  {
    id: 'cluster-health',
    label: '集群健康',
    group: '集群',
    method: 'GET',
    path: '/_cluster/health',
    requiresIndex: false,
    write: false,
    bodyKind: 'none',
    resultView: 'json'
  },
  {
    id: 'allocation-explain',
    label: '未分配分片原因',
    group: '集群',
    method: 'GET',
    path: '/_cluster/allocation/explain',
    requiresIndex: false,
    write: false,
    bodyKind: 'none',
    resultView: 'json'
  },
  {
    id: 'thread-pool',
    label: '线程池',
    group: '集群',
    method: 'GET',
    path: '/_cat/thread_pool',
    requiresIndex: false,
    write: false,
    bodyKind: 'none',
    resultView: 'table'
  },
  {
    id: 'index-doc',
    label: '索引文档',
    group: '写入',
    method: 'POST',
    path: '/{index}/_doc/{docId}',
    requiresIndex: true,
    requiresDocId: true,
    write: true,
    bodyKind: 'none',
    resultView: 'json'
  },
  {
    id: 'update-doc',
    label: '更新文档',
    group: '写入',
    method: 'POST',
    path: '/{index}/_update/{docId}',
    requiresIndex: true,
    requiresDocId: true,
    write: true,
    bodyKind: 'none',
    resultView: 'json'
  },
  {
    id: 'delete-doc',
    label: '删除文档',
    group: '写入',
    method: 'DELETE',
    path: '/{index}/_doc/{docId}',
    requiresIndex: true,
    requiresDocId: true,
    write: true,
    bodyKind: 'none',
    resultView: 'json'
  }
]

const BY_ID = new Map(OPERATIONS.map((op) => [op.id, op]))

export function listOperations(): OperationDef[] {
  return OPERATIONS
}

export function getOperation(id: string): OperationDef | undefined {
  return BY_ID.get(id as OperationId)
}

export function isOperationId(id: string): id is OperationId {
  return BY_ID.has(id as OperationId)
}

export interface PathContext {
  index?: string | null
  docId?: string
}

export function buildPath(op: OperationDef, ctx: PathContext): string {
  let path = op.path
  if (path.includes('{index}')) {
    path = path.replace('{index}', encodeURIComponent(ctx.index ?? '_all'))
  }
  if (path.includes('{docId}')) {
    path = path.replace('{docId}', encodeURIComponent(ctx.docId ?? ''))
  }
  return path
}
