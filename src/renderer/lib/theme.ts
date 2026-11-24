/**
 * 主题偏好：浅色、深色、跟随系统。
 * 偏好存在 localStorage，首帧由 index.html 的内联脚本提前应用，避免闪烁。
 */

import type { ThemePreference } from '@shared/ipc'

export type { ThemePreference }
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'elastic-tool:theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage 不可用时退回跟随系统
  }
  return 'system'
}

export function writeThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    // 写不进去不影响本次会话
  }
}

export function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'light') return 'light'
  if (preference === 'dark') return 'dark'
  return systemPrefersDark() ? 'dark' : 'light'
}

export function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
}

export function watchSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/**
 * 切换主题时用 View Transition 做一次从点击位置扩散的过渡。
 * 浏览器不支持或用户要求减少动效时直接切换。
 */
export function withThemeTransition(origin: { x: number; y: number }, apply: () => void): void {
  const root = document.documentElement
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const startViewTransition = (
    document as Document & {
      startViewTransition?: (callback: () => void) => { finished: Promise<void> }
    }
  ).startViewTransition

  if (!startViewTransition || reduceMotion) {
    apply()
    return
  }

  root.style.setProperty('--theme-origin-x', `${origin.x}px`)
  root.style.setProperty('--theme-origin-y', `${origin.y}px`)
  startViewTransition.call(document, apply)
}
