import type {
  AppInfo,
  ClusterDiagnostics,
  ConnectionInput,
  ConnectionSummary,
  EsRunRequest,
  EsRunResult,
  HistoryEntry,
  IndexSchema,
  IndexSummary,
  Metrics,
  QueryOptions,
  QueryTree,
  SavedQuery,
  TestResult
} from './types'

export const IPC = {
  appInfo: 'app:info',
  appMetrics: 'metrics:update',
  connectionList: 'connection:list',
  connectionSave: 'connection:save',
  connectionRemove: 'connection:remove',
  connectionTest: 'connection:test',
  connectionDetail: 'connection:detail',
  connectionTestDraft: 'connection:test-draft',
  indexList: 'index:list',
  indexSchema: 'index:schema',
  indexRefreshSchema: 'index:refresh-schema',
  esRun: 'es:run',
  esCancel: 'es:cancel',
  esCurl: 'es:curl',
  clusterDiagnostics: 'cluster:diagnostics',
  clusterHotThreads: 'cluster:hot-threads',
  historyList: 'history:list',
  historyClear: 'history:clear',
  savedList: 'saved:list',
  savedSave: 'saved:save',
  savedRemove: 'saved:remove'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

/** 与渲染层主题偏好保持一致，主进程据此调整窗口底色与原生控件。 */
export type ThemePreference = 'light' | 'dark' | 'system'

export interface SavedQueryInput {
  id?: string
  name: string
  connectionId: string
  index: string | null
  tree: QueryTree
  options: QueryOptions
  dslText: string
}

export interface CurlInput {
  connectionId: string
  operationId: string
  index: string | null
  dslText?: string
  docId?: string
}

/** 编辑连接时回填用的详情，不返回密码类字段，只说明是否已经保存过凭证。 */
export interface ConnectionDetail {
  id: string
  name: string
  url: string
  environment: ConnectionInput['environment']
  readOnly: boolean
  auth: {
    type: ConnectionInput['auth']['type']
    username?: string
    apiKeyId?: string
    hasSecret: boolean
  }
  tls: { rejectUnauthorized: boolean; caCertPath?: string }
  proxy?: string
  timeoutMs: number
}

export interface RendererApi {
  app: {
    info(): Promise<AppInfo>
    onMetrics(callback: (metrics: Metrics) => void): () => void
  }
  connections: {
    list(): Promise<ConnectionSummary[]>
    save(input: ConnectionInput): Promise<ConnectionSummary>
    remove(id: string): Promise<void>
    test(id: string): Promise<TestResult>
    detail(id: string): Promise<ConnectionDetail>
    testDraft(input: ConnectionInput): Promise<TestResult>
  }
  indices: {
    list(connectionId: string): Promise<IndexSummary[]>
    schema(connectionId: string, index: string): Promise<IndexSchema>
    refreshSchema(connectionId: string, index: string): Promise<IndexSchema>
  }
  es: {
    run(request: EsRunRequest): Promise<EsRunResult>
    cancel(requestId: string): Promise<void>
    curl(input: CurlInput): Promise<string>
  }
  cluster: {
    diagnostics(connectionId: string): Promise<ClusterDiagnostics>
    hotThreads(connectionId: string): Promise<string>
  }
  history: {
    list(connectionId?: string): Promise<HistoryEntry[]>
    clear(): Promise<void>
  }
  saved: {
    list(): Promise<SavedQuery[]>
    save(input: SavedQueryInput): Promise<SavedQuery>
    remove(id: string): Promise<void>
  }
  window: {
    minimize(): Promise<void>
    toggleMaximize(): Promise<void>
    close(): Promise<void>
    isMaximized(): Promise<boolean>
    setTheme(preference: ThemePreference): Promise<void>
  }
  clipboard: {
    writeText(text: string): Promise<void>
  }
}
