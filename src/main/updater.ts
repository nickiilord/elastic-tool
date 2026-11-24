import { app, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'

// 启动后延迟首次检查，之后按固定间隔检查
const FIRST_CHECK_DELAY_MS = 5_000
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

// 自动更新只在打包后的 Windows / macOS 上启用，开发模式直接跳过
function isUpdateSupported(): boolean {
  return app.isPackaged && (process.platform === 'win32' || process.platform === 'darwin')
}

async function checkForUpdates(): Promise<void> {
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    // 更新失败不影响应用正常使用
    console.error('[updater] 检查更新失败:', error)
  }
}

// 发现新版本后询问是否下载
async function askDownload(version: string): Promise<void> {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: '发现新版本',
    message: `发现新版本 v${version}，是否下载？`,
    buttons: ['下载', '稍后'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  })
  if (response !== 0) return

  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    console.error('[updater] 下载更新失败:', error)
  }
}

// 下载完成后询问是否重启安装
async function askInstall(): Promise<void> {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: '更新已下载',
    message: '更新已下载，重启后生效。',
    detail: '是否立即重启并完成安装？',
    buttons: ['立即重启', '稍后'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  })
  if (response !== 0) return

  autoUpdater.quitAndInstall()
}

export function setupAutoUpdater(): void {
  if (!isUpdateSupported()) return

  autoUpdater.autoDownload = false
  autoUpdater.on('update-available', (info) => void askDownload(info.version))
  autoUpdater.on('update-downloaded', () => void askInstall())
  autoUpdater.on('error', (error) => console.error('[updater] 更新出错:', error))

  setTimeout(() => void checkForUpdates(), FIRST_CHECK_DELAY_MS)
  setInterval(() => void checkForUpdates(), CHECK_INTERVAL_MS)
}
