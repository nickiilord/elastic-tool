import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/ipc'
import { registerIpc } from './ipc'
import { ConnectionStore } from './services/connection-store'
import { HistoryStore } from './services/history-store'
import { SavedStore } from './services/saved-store'
import { SchemaCache } from './services/schema-cache'
import { MetricsSampler } from './services/metrics'
import { setupApplicationMenu } from './menu'
import { setupAutoUpdater } from './updater'
import { createMainWindow } from './window'
import { saveWindowStateNow } from './window-state'

// 开发与自动化调试时开放 CDP 端口，生产不读取该变量。
const debugPort = process.env.ES_PROBE_DEBUG_PORT
if (debugPort) {
  app.commandLine.appendSwitch('remote-debugging-port', debugPort)
}

const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let sampler: MetricsSampler | null = null
let services: ReturnType<typeof createServices> | null = null

function createServices(): {
  connections: ConnectionStore
  history: HistoryStore
  saved: SavedStore
  schemas: SchemaCache
  getWindow: () => BrowserWindow | null
} {
  const dir = app.getPath('userData')
  return {
    connections: new ConnectionStore(dir),
    history: new HistoryStore(dir),
    saved: new SavedStore(dir),
    schemas: new SchemaCache(join(dir, 'schema-cache')),
    getWindow: () => mainWindow
  }
}

function openWindow(): void {
  if (!services) services = createServices()
  registerIpc(services)
  mainWindow = createMainWindow()
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  sampler = new MetricsSampler()
  sampler.start((sample) => {
    const window = mainWindow
    if (!window || window.isDestroyed()) return
    window.webContents.send(IPC.appMetrics, {
      rssBytes: sample.rssBytes,
      cpuPercent: sample.cpuPercent,
      connections: services
        ? services.connections.list().map((connection) => ({
            ...connection,
            status: connection.url.startsWith('demo://') ? 'connected' : 'unknown'
          }))
        : []
    })
  })
}

app.whenReady().then(() => {
  setupApplicationMenu()
  openWindow()
  setupAutoUpdater()

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
})

app.on('window-all-closed', () => {
  sampler?.stop()
  if (process.platform !== 'darwin') app.quit()
})

// 退出前再保存一次窗口状态
app.on('before-quit', () => {
  saveWindowStateNow()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) openWindow()
})
