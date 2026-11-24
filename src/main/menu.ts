import { app, dialog, Menu, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'

export const PROJECT_HOMEPAGE = 'https://github.com/nickiilord/elastic-tool'

// 关于对话框：展示版本与运行时信息，并可直接打开项目主页
async function showAboutDialog(): Promise<void> {
  const detail = [
    `版本：${app.getVersion()}`,
    `Electron：${process.versions.electron}`,
    `Chromium：${process.versions.chrome}`,
    `Node：${process.versions.node}`,
    `平台：${process.platform} ${process.arch}`,
    '',
    '一个基于 Electron、React 与 shadcn/ui 的 Elasticsearch 桌面客户端。'
  ].join('\n')

  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: '关于 elastic-tool',
    message: 'elastic-tool',
    detail,
    buttons: ['确定', '打开项目主页'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  })

  if (response === 1) await shell.openExternal(PROJECT_HOMEPAGE)
}

// macOS 需要单独的应用菜单，Windows 与 Linux 直接从文件菜单开始
function createAppMenu(): MenuItemConstructorOptions {
  return {
    label: app.name,
    submenu: [
      { label: '关于 elastic-tool', click: () => void showAboutDialog() },
      { type: 'separator' },
      { role: 'services', label: '服务' },
      { type: 'separator' },
      { role: 'hide', label: '隐藏 elastic-tool' },
      { role: 'hideOthers', label: '隐藏其他' },
      { role: 'unhide', label: '显示全部' },
      { type: 'separator' },
      { role: 'quit', label: '退出 elastic-tool' }
    ]
  }
}

// 构建并应用应用菜单，各平台共用同一套菜单内容
export function setupApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [createAppMenu()] : []),
    {
      label: '文件',
      submenu: [{ role: 'quit', label: '退出' }]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { label: '关于 elastic-tool', click: () => void showAboutDialog() },
        { label: '项目主页', click: () => void shell.openExternal(PROJECT_HOMEPAGE) }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
