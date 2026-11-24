/**
 * 主进程与渲染进程共享的数据类型。
 * 这个文件不能 import Electron、React 或 Node 内置模块，保证两端都能引用。
 */

export type Environment = 'prod' | 'staging' | 'dev'

export type Auth =
  | { type: 'none' }
  | { type: 'basic'; username: string; password: string }
  | { type: 'apiKey'; id: string; key: string }
  | { type: 'bearer'; token: string }

export interface Connection {
  id: string
  name: string
  url: string
  environment: Environment
  readOnly: boolean
  auth: Auth
  tls: { rejectUnauthorized: boolean; caCertPath?: string }
  proxy?: string
  timeoutMs: number
  createdAt: string
  updatedAt: string
}

export interface ConnectionSummary {
  id: string
  name: string
  url: string
  environment: Environment
  readOnly: boolean
  status: 'connected' | 'disconnected' | 'unknown'
  version?: string
  latencyMs?: number
}

export interface ConnectionInput {
  id?: string
  name: string
  url: string
  environment: Environment
  readOnly: boolean
  auth: Auth
  tls: { rejectUnauthorized: boolean; caCertPath?: string }
  proxy?: string
  timeoutMs?: number
}

export interface TestResult {
  ok: boolean
  version?: string
  clusterName?: string
  nodes?: number
  latencyMs: number
  error?: string
}

export interface IndexSummary {
  name: string
  health: 'green' | 'yellow' | 'red'
  docsCount: number
  storeSizeBytes: number
  primaryShards: number
  replicas: number
}

export interface FieldSchema {
  path: string
  type: string
  aggregatable: boolean
  searchable: boolean
  children?: FieldSchema[]
  keywordSubfield?: string
}

export interface IndexSchema {
  index: string
  fields: FieldSchema[]
  docCount: number
  cachedAt: string
  mappingRaw: unknown
}

export interface AppInfo {
  version: string
  platform: string
  locale: string
  timezone: string
}

export interface Metrics {
  rssBytes: number
  cpuPercent: number
  connections: ConnectionSummary[]
}

/* ------------------------------ 查询条件树 ------------------------------ */

export type GroupLogic = 'all' | 'any'

export type ConditionValue =
  | { kind: 'scalar'; value: string | number | boolean }
  | { kind: 'list'; values: string[] }
  | { kind: 'range'; from: string | null; to: string | null }
  | { kind: 'relative'; unit: 'h' | 'd'; amount: number }
  | { kind: 'none' }

export interface QueryCondition {
  kind: 'condition'
  id: string
  field: string | null
  operator: string | null
  value: ConditionValue | null
}

export interface QueryGroup {
  kind: 'group'
  id: string
  logic: GroupLogic
  children: Array<QueryCondition | QueryGroup>
  collapsed?: boolean
}

export interface ExclusionGroup {
  kind: 'exclusion'
  id: string
  children: QueryCondition[]
  collapsed?: boolean
}

export interface QueryTree {
  root: QueryGroup
  exclusion: ExclusionGroup
}

export interface QueryOptions {
  size: number
  trackTotalHits: boolean
  sort: { field: string; order: 'asc' | 'desc' } | null
}

/* ------------------------------ 校验 ------------------------------ */

export type ValidationLevel = 'block' | 'warn'

export type FixKind = 'change-field' | 'change-operator' | 'change-value' | 'swap-range'

export interface ValidationFix {
  label: string
  kind: FixKind
  payload: Record<string, unknown>
}

export interface ValidationIssue {
  id: string
  level: ValidationLevel
  conditionId: string
  field: string
  message: string
  meta: string
  fix?: ValidationFix
  estimate?: string
}

/* ------------------------------ 编译结果 ------------------------------ */

export interface CompileSummary {
  conditionId: string
  field: string
  text: string
  meta: string
}

export interface CompileResult {
  dsl: Record<string, unknown> | null
  summaries: CompileSummary[]
  conditionsCount: number
  incompleteCount: number
}

/* ------------------------------ 历史与收藏 ------------------------------ */

export interface HistoryEntry {
  id: string
  connectionId: string
  index: string | null
  operationId: string
  method: string
  path: string
  startedAt: string
  durationMs: number
  status: number | 'error'
  hits?: number
}

export interface SavedQuery {
  id: string
  name: string
  connectionId: string
  index: string | null
  tree: QueryTree
  options: QueryOptions
  dslText: string
  createdAt: string
}

/* ------------------------------ 执行请求 ------------------------------ */

export interface EsRunRequest {
  connectionId: string
  index: string | null
  operationId: string
  dsl: Record<string, unknown> | null
  dslText?: string
  requestId: string
  params?: Record<string, string>
}

export interface EsRunResult {
  requestId: string
  status: number
  statusText: string
  durationMs: number
  took?: number
  hits?: number
  total?: number
  shards?: { total: number; successful: number; failed: number }
  body: unknown
}

export type EsErrorCode =
  | 'network'
  | 'timeout'
  | 'auth'
  | 'es'
  | 'readonly'
  | 'validation'
  | 'canceled'

export interface EsErrorPayload {
  code: EsErrorCode
  message: string
  status?: number
  type?: string
  reason?: string
  body?: unknown
}

/* ------------------------------ 集群诊断 ------------------------------ */

export interface ClusterDiagnostics {
  fetchedAt: string
  health: { status: 'green' | 'yellow' | 'red'; unassignedShards: number; indices: number }
  nodes: { total: number; online: number; dedicatedMasters: number }
  shards: { total: number; primary: number; replica: number; unassigned: number }
  disk: { highestPercent: number; node: string; watermarkPercent: number }
  threadPoolRejections: { total: number; pool: string; window: string }
  unassigned: Array<{
    index: string
    shard: number
    role: 'p' | 'r'
    node: string
    reason: string
    suggestion: string
  }>
  threadPools: Array<{
    name: string
    queue: number
    rejected: number
    active: number
  }>
  nodeStats: Array<{
    name: string
    roles: string[]
    cpuPercent: number
    heapPercent: number
    diskPercent: number
    assignedShards: number
    diskWatermarkExceeded: boolean
  }>
  segments: { count: number; mergesInProgress: number }
  queryCacheHitPercent: number
  fielddataBytes: number
}

/* ------------------------------ 查询文档 ------------------------------ */

export type QueryMode = 'builder' | 'dsl'
export type ResultTab = 'table' | 'json' | 'aggs' | 'profile'

export interface QueryDocument {
  id: string
  title: string
  connectionId: string
  index: string | null
  mode: QueryMode
  operationId: string
  tree: QueryTree
  options: QueryOptions
  dslText: string
  dirty: boolean
  resultTab: ResultTab
  /** 当前结果页，从 0 开始。翻页时按 page × size 计算 from。 */
  page: number
}
