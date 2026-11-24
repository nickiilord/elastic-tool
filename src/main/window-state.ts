import { app, screen } from 'electron'
import type { BrowserWindow } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// 持久化到 userData/window-state.json 的窗口状态
export interface WindowState {
  // 没有保存过位置时为空，交给 Electron 自动居中
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

export const MIN_WINDOW_WIDTH = 1160
export const MIN_WINDOW_HEIGHT = 720
export const DEFAULT_WINDOW_WIDTH = 1440
export const DEFAULT_WINDOW_HEIGHT = 900

// 窗口与显示器工作区至少要有这么大的重叠，才认为位置有效
const MIN_VISIBLE_SIZE = 100
// 移动或缩放窗口后，延迟这么久再写文件
const SAVE_DELAY_MS = 300

let trackedWindow: BrowserWindow | null = null
let pendingTimer: ReturnType<typeof setTimeout> | null = null

function stateFile(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function defaultState(): WindowState {
  return {
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    maximized: false
  }
}

// 窗口是否至少有一部分落在某个显示器的工作区内
function isVisibleOnSomeDisplay(state: WindowState & { x: number; y: number }): boolean {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea
    const visibleWidth =
      Math.min(state.x + state.width, area.x + area.width) - Math.max(state.x, area.x)
    const visibleHeight =
      Math.min(state.y + state.height, area.y + area.height) - Math.max(state.y, area.y)
    return visibleWidth >= MIN_VISIBLE_SIZE && visibleHeight >= MIN_VISIBLE_SIZE
  })
}

// 读取上次保存的窗口状态，位置不可用时回退到默认尺寸并居中
export function loadWindowState(): WindowState {
  const file = stateFile()
  if (!existsSync(file)) return defaultState()

  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<WindowState>
    if (!isFiniteNumber(raw.width) || !isFiniteNumber(raw.height)) return defaultState()

    const width = Math.max(MIN_WINDOW_WIDTH, Math.round(raw.width))
    const height = Math.max(MIN_WINDOW_HEIGHT, Math.round(raw.height))
    const maximized = raw.maximized === true

    if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y)) {
      return { width, height, maximized }
    }

    const state: WindowState & { x: number; y: number } = {
      x: Math.round(raw.x),
      y: Math.round(raw.y),
      width,
      height,
      maximized
    }
    // 例如外接显示器被拔掉后，保存的坐标可能已经不在任何屏幕上
    return isVisibleOnSomeDisplay(state) ? state : defaultState()
  } catch {
    return defaultState()
  }
}

// 记录当前窗口状态，最大化时保存还原后的位置和尺寸
function snapshot(window: BrowserWindow): WindowState {
  const bounds = window.getNormalBounds()
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    maximized: window.isMaximized()
  }
}

function persist(window: BrowserWindow): void {
  try {
    writeFileSync(stateFile(), JSON.stringify(snapshot(window), null, 2), 'utf8')
  } catch (error) {
    console.error('[window-state] 保存窗口状态失败:', error)
  }
}

function clearPendingTimer(): void {
  if (!pendingTimer) return
  clearTimeout(pendingTimer)
  pendingTimer = null
}

function scheduleSave(window: BrowserWindow): void {
  clearPendingTimer()
  pendingTimer = setTimeout(() => {
    pendingTimer = null
    if (!window.isDestroyed()) persist(window)
  }, SAVE_DELAY_MS)
}

// 立即写入当前窗口状态，退出前调用
export function saveWindowStateNow(): void {
  clearPendingTimer()
  if (!trackedWindow || trackedWindow.isDestroyed()) return
  persist(trackedWindow)
}

// 跟踪窗口的位置、尺寸与最大化状态变化
export function trackWindowState(window: BrowserWindow): void {
  trackedWindow = window
  const save = (): void => scheduleSave(window)

  window.on('resize', save)
  window.on('move', save)
  window.on('maximize', save)
  window.on('unmaximize', save)
  window.on('close', () => {
    // 关闭时立即写一次，避免防抖计时器还没触发
    clearPendingTimer()
    if (!window.isDestroyed()) persist(window)
  })
  window.on('closed', () => {
    if (trackedWindow === window) trackedWindow = null
  })
}
