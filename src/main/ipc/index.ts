import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { z } from 'zod'
import type {
  ClusterDiagnostics,
  Connection,
  ConnectionSummary,
  EsErrorPayload,
  EsRunRequest,
  EsRunResult,
  FieldSchema,
  IndexSchema,
  IndexSummary
} from '@shared/types'
import { IPC } from '@shared/ipc'
import type { CurlInput, SavedQueryInput, ThemePreference } from '@shared/ipc'
import { EsRunError, runOperation } from '../es/run'
import { buildCurl } from '../es/curl'
import { esHttpRequest } from '../es/client'
import { demoDiagnostics, demoHotThreads, demoIndices, demoSchema, demoTest } from '../services/demo'
import type { ConnectionStore } from '../services/connection-store'
import type { HistoryStore } from '../services/history-store'
import type { SavedStore } from '../services/saved-store'
import type { SchemaCache } from '../services/schema-cache'
import { collectDiagnostics } from '../services/diagnostics'

export interface AppServices {
  connections: ConnectionStore
  history: HistoryStore
  saved: SavedStore
  schemas: SchemaCache
  getWindow: () => BrowserWindow | null
}

const authSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('basic'), username: z.string(), password: z.string() }),
  z.object({ type: z.literal('apiKey'), id: z.string(), key: z.string() }),
  z.object({ type: z.literal('bearer'), token: z.string() })
])

const connectionInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  url: z.string().min(1),
  environment: z.enum(['prod', 'staging', 'dev']),
  readOnly: z.boolean(),
  auth: authSchema,
  tls: z.object({ rejectUnauthorized: z.boolean(), caCertPath: z.string().optional() }),
  proxy: z.string().optional(),
  timeoutMs: z.number().optional()
})

const runRequestSchema = z.object({
  connectionId: z.string(),
  index: z.string().nullable(),
  operationId: z.string(),
  dsl: z.record(z.string(), z.unknown()).nullable(),
  dslText: z.string().optional(),
  requestId: z.string(),
  params: z.record(z.string(), z.string()).optional()
})

const savedInputSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  connectionId: z.string(),
  index: z.string().nullable(),
  tree: z.unknown(),
  options: z.unknown(),
  dslText: z.string()
})

const curlInputSchema = z.object({
  connectionId: z.string(),
  operationId: z.string(),
  index: z.string().nullable(),
  dslText: z.string().optional(),
  docId: z.string().optional()
})

function toErrorPayload(error: unknown): EsErrorPayload {
  if (error instanceof EsRunError) return error.payload
  if (error instanceof z.ZodError) {
    return { code: 'validation', message: '参数不合法', body: error.issues }
  }
  if (error instanceof Error) return { code: 'network', message: error.message }
  return { code: 'network', message: '未知错误' }
}

type IpcResult<T> = { ok: true; data: T } | { ok: false; error: EsErrorPayload }

function handle<TPayload, TResult>(
  channel: string,
  fn: (payload: TPayload, services: AppServices) => Promise<TResult> | TResult,
  services: AppServices
): void {
  ipcMain.handle(channel, async (_event, payload: TPayload): Promise<IpcResult<TResult>> => {
    try {
      const data = await fn(payload, services)
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: toErrorPayload(error) }
    }
  })
}

function assertConnection(services: AppServices, id: string): Connection {
  const connection = services.connections.get(id)
  if (!connection) {
    throw new EsRunError({ code: 'validation', message: '连接不存在' })
  }
  return connection
}

function mappingToFields(mapping: unknown): FieldSchema[] {
  if (typeof mapping !== 'object' || mapping === null) return []
  const entries = Object.values(mapping as Record<string, unknown>)
  const first = entries[0] as { mappings?: { properties?: Record<string, unknown> } } | undefined
  const properties = first?.mappings?.properties
  if (!properties) return []

  const walk = (props: Record<string, unknown>, prefix: string): FieldSchema[] => {
    const out: FieldSchema[] = []
    for (const [name, raw] of Object.entries(props)) {
      const def = (raw ?? {}) as Record<string, unknown>
      const path = prefix ? `${prefix}.${name}` : name
      const hasChildren = typeof def.properties === 'object' && def.properties !== null
      const type =
        typeof def.type === 'string' ? def.type : hasChildren ? 'object' : 'keyword'
      const fields = def.fields as Record<string, { type?: string }> | undefined
      const keywordSubfield =
        fields && fields.keyword
          ? `${path}.keyword`
          : type === 'text' && !hasChildren
            ? `${path}.keyword`
            : undefined
      const aggregatable =
        type !== 'text' && type !== 'object' && type !== 'nested' && def.doc_values !== false
      const searchable = def.index !== false
      out.push({
        path,
        type,
        aggregatable,
        searchable,
        ...(hasChildren
          ? { children: walk(def.properties as Record<string, unknown>, path) }
          : {}),
        ...(keywordSubfield ? { keywordSubfield } : {})
      })
    }
    return out
  }

  return walk(properties, '')
}

async function loadSchema(
  services: AppServices,
  connection: Connection,
  index: string,
  force: boolean
): Promise<IndexSchema> {
  if (!force) {
    const cached = services.schemas.get(connection.id, index)
    if (cached) return cached
  }

  if (connection.url.startsWith('demo://')) {
    const schema = demoSchema(index)
    services.schemas.set(connection.id, index, schema)
    return schema
  }

  const request: EsRunRequest = {
    connectionId: connection.id,
    index,
    operationId: 'mapping',
    dsl: null,
    requestId: `schema_${Date.now()}`
  }
  const controller = new AbortController()
  const result = await runOperation(connection, request, controller.signal)
  const fields = mappingToFields(result.body)
  const schema: IndexSchema = {
    index,
    fields,
    docCount: 0,
    cachedAt: new Date().toISOString(),
    mappingRaw: result.body
  }
  services.schemas.set(connection.id, index, schema)
  return schema
}

export function registerIpc(services: AppServices): void {
  handle(IPC.appInfo, () => ({
    version: app.getVersion(),
    platform: process.platform,
    locale: app.getLocale(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  }), services)

  handle(IPC.connectionList, () => services.connections.list(), services)

  handle<unknown, ConnectionSummary>(IPC.connectionSave, (payload) => {
    const input = connectionInputSchema.parse(payload)
    return services.connections.save(input)
  }, services)

  handle<string, void>(IPC.connectionRemove, (id) => {
    services.connections.remove(id)
  }, services)

  handle<string, { ok: boolean; version?: string; clusterName?: string; nodes?: number; latencyMs: number; error?: string }>(
    IPC.connectionTest,
    async (id) => {
      const connection = assertConnection(services, id)
      if (connection.url.startsWith('demo://')) return demoTest()
      const startedAt = Date.now()
      try {
        const request: EsRunRequest = {
          connectionId: connection.id,
          index: null,
          operationId: 'cluster-health',
          dsl: null,
          requestId: `test_${Date.now()}`
        }
        const controller = new AbortController()
        const result = await runOperation(connection, request, controller.signal)
        const body = result.body as { status?: string; number_of_nodes?: number }
        return {
          ok: true,
          version: '8.x',
          clusterName: 'cluster',
          nodes: body.number_of_nodes,
          latencyMs: Date.now() - startedAt
        }
      } catch (error) {
        return {
          ok: false,
          latencyMs: Date.now() - startedAt,
          error: error instanceof EsRunError ? error.payload.message : '连接失败'
        }
      }
    },
    services
  )

  handle<string, IndexSummary[]>(IPC.indexList, async (connectionId) => {
    const connection = assertConnection(services, connectionId)
    if (connection.url.startsWith('demo://')) return demoIndices()

    const request: EsRunRequest = {
      connectionId,
      index: null,
      operationId: 'cluster-health',
      dsl: null,
      requestId: `indices_${Date.now()}`
    }
    const controller = new AbortController()
    // 真实集群的索引列表需要 /_cat/indices；这里复用底层 HTTP 客户端
    const response = await fetchCatIndices(connection, controller.signal)
    return response
  }, services)

  handle<{ connectionId: string; index: string }, IndexSchema>(
    IPC.indexSchema,
    ({ connectionId, index }) => {
      const connection = assertConnection(services, connectionId)
      return loadSchema(services, connection, index, false)
    },
    services
  )

  handle<{ connectionId: string; index: string }, IndexSchema>(
    IPC.indexRefreshSchema,
    ({ connectionId, index }) => {
      const connection = assertConnection(services, connectionId)
      services.schemas.invalidate(connectionId, index)
      return loadSchema(services, connection, index, true)
    },
    services
  )

  handle<EsRunRequest, EsRunResult>(IPC.esRun, async (payload) => {
    const request = runRequestSchema.parse(payload) as EsRunRequest
    const connection = assertConnection(services, request.connectionId)
    const controller = new AbortController()
    controllers.set(request.requestId, controller)

    try {
      const result = await runOperation(connection, request, controller.signal)
      services.history.add({
        id: `h_${Date.now()}`,
        connectionId: request.connectionId,
        index: request.index,
        operationId: request.operationId,
        method: request.dsl ? 'POST' : 'GET',
        path: `/${request.index ?? ''}`,
        startedAt: new Date().toISOString(),
        durationMs: result.durationMs,
        status: result.status,
        hits: result.total
      })
      return result
    } finally {
      controllers.delete(request.requestId)
    }
  }, services)

  handle<string, void>(IPC.esCancel, (requestId) => {
    controllers.get(requestId)?.abort()
    controllers.delete(requestId)
  }, services)

  handle<CurlInput, string>(
    IPC.esCurl,
    (payload) => {
      const input = curlInputSchema.parse(payload) as CurlInput
      const connection = assertConnection(services, input.connectionId)
      let dsl: Record<string, unknown> | null = null
      if (input.dslText) {
        try {
          const parsed: unknown = JSON.parse(input.dslText)
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            dsl = parsed as Record<string, unknown>
          }
        } catch {
          dsl = null
        }
      }
      return buildCurl({
        connection,
        operationId: input.operationId,
        index: input.index,
        dsl,
        docId: input.docId
      })
    },
    services
  )

  handle<string, ClusterDiagnostics>(IPC.clusterDiagnostics, async (connectionId) => {
    const connection = assertConnection(services, connectionId)
    if (connection.url.startsWith('demo://')) {
      await new Promise((resolve) => setTimeout(resolve, 120))
      return demoDiagnostics()
    }
    return collectDiagnostics(connection)
  }, services)

  handle<string, string>(IPC.clusterHotThreads, async (connectionId) => {
    const connection = assertConnection(services, connectionId)
    if (connection.url.startsWith('demo://')) return demoHotThreads()
    const result = await runOperation(
      connection,
      {
        connectionId,
        index: null,
        operationId: 'cluster-health',
        dsl: null,
        requestId: `hot_${Date.now()}`
      },
      new AbortController().signal
    )
    return typeof result.body === 'string' ? result.body : JSON.stringify(result.body, null, 2)
  }, services)

  handle(IPC.historyList, (connectionId: string | undefined) => services.history.list(connectionId), services)
  handle(IPC.historyClear, () => services.history.clear(), services)

  handle(IPC.savedList, () => services.saved.list(), services)
  handle<SavedQueryInput, unknown>(IPC.savedSave, (input) => {
    const parsed = savedInputSchema.parse(input) as unknown as SavedQueryInput
    return services.saved.save(parsed)
  }, services)
  handle<string, void>(IPC.savedRemove, (id) => services.saved.remove(id), services)

  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.handle('window:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
  ipcMain.handle('window:is-maximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })
  ipcMain.handle('window:set-theme', (event, preference: ThemePreference) => {
    nativeTheme.themeSource = preference
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return
    const dark = preference === 'dark' || (preference === 'system' && nativeTheme.shouldUseDarkColors)
    window.setBackgroundColor(dark ? '#0a0a0a' : '#ffffff')
  })
}

const controllers = new Map<string, AbortController>()

async function fetchCatIndices(
  connection: Connection,
  signal: AbortSignal
): Promise<IndexSummary[]> {
  const response = await esHttpRequest({
    baseUrl: connection.url,
    path: '/_cat/indices?format=json&h=index,health,docs.count,store.size,pri,rep',
    method: 'GET',
    auth: connection.auth,
    rejectUnauthorized: connection.tls.rejectUnauthorized,
    timeoutMs: connection.timeoutMs,
    signal
  })
  const rows = Array.isArray(response.body) ? response.body : []
  return rows.map((row: Record<string, string>) => ({
    name: row.index ?? '',
    health: (row.health as IndexSummary['health']) ?? 'green',
    docsCount: Number(row['docs.count'] ?? 0),
    storeSizeBytes: parseStoreSize(row['store.size']),
    primaryShards: Number(row.pri ?? 1),
    replicas: Number(row.rep ?? 0)
  }))
}

function parseStoreSize(raw: string | undefined): number {
  if (!raw) return 0
  const match = /^([\d.]+)\s*(b|kb|mb|gb|tb|pb)?$/i.exec(raw.trim())
  if (!match) return 0
  const value = Number(match[1])
  const unit = (match[2] ?? 'b').toLowerCase()
  const factor: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 ** 2,
    gb: 1024 ** 3,
    tb: 1024 ** 4,
    pb: 1024 ** 5
  }
  return Math.round(value * (factor[unit] ?? 1))
}
