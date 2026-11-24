import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type { RendererApi } from '@shared/ipc'
import type { Metrics } from '@shared/types'

async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  const result = await ipcRenderer.invoke(channel, payload)
  if (result && typeof result === 'object' && 'ok' in result) {
    if (result.ok) return result.data as T
    const error = Object.assign(new Error(result.error.message), result.error)
    throw error
  }
  return result as T
}

const api: RendererApi = {
  app: {
    info: () => invoke(IPC.appInfo),
    onMetrics: (callback: (metrics: Metrics) => void) => {
      const listener = (_event: unknown, metrics: Metrics): void => callback(metrics)
      ipcRenderer.on(IPC.appMetrics, listener)
      return () => ipcRenderer.removeListener(IPC.appMetrics, listener)
    }
  },
  connections: {
    list: () => invoke(IPC.connectionList),
    save: (input) => invoke(IPC.connectionSave, input),
    remove: (id) => invoke(IPC.connectionRemove, id),
    test: (id) => invoke(IPC.connectionTest, id)
  },
  indices: {
    list: (connectionId) => invoke(IPC.indexList, connectionId),
    schema: (connectionId, index) => invoke(IPC.indexSchema, { connectionId, index }),
    refreshSchema: (connectionId, index) =>
      invoke(IPC.indexRefreshSchema, { connectionId, index })
  },
  es: {
    run: (request) => invoke(IPC.esRun, request),
    cancel: (requestId) => invoke(IPC.esCancel, requestId),
    curl: (input) => invoke(IPC.esCurl, input)
  },
  cluster: {
    diagnostics: (connectionId) => invoke(IPC.clusterDiagnostics, connectionId),
    hotThreads: (connectionId) => invoke(IPC.clusterHotThreads, connectionId)
  },
  history: {
    list: (connectionId) => invoke(IPC.historyList, connectionId),
    clear: () => invoke(IPC.historyClear)
  },
  saved: {
    list: () => invoke(IPC.savedList),
    save: (input) => invoke(IPC.savedSave, input),
    remove: (id) => invoke(IPC.savedRemove, id)
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    setTheme: (preference) => ipcRenderer.invoke('window:set-theme', preference)
  }
}

contextBridge.exposeInMainWorld('api', api)
