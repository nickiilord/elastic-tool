import { useCallback, useEffect, useState } from 'react'
import {
  applyTheme,
  resolveTheme,
  watchSystemTheme,
  withThemeTransition,
  writeThemePreference
} from '@/lib/theme'
import type { ResolvedTheme, ThemePreference } from '@/lib/theme'
import { useUiStore } from '@/stores/ui-store'

/** 当前实际生效的主题，跟随系统时会随系统切换更新。 */
export function useResolvedTheme(): ResolvedTheme {
  const theme = useUiStore((state) => state.theme)
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(theme))

  useEffect(() => {
    const sync = (): void => setResolved(resolveTheme(theme))
    sync()
    if (theme !== 'system') return
    return watchSystemTheme(sync)
  }, [theme])

  return resolved
}

export function useTheme() {
  const theme = useUiStore((state) => state.theme)
  const setTheme = useUiStore((state) => state.setTheme)
  const resolved = useResolvedTheme()

  const toggle = useCallback(
    (event?: React.MouseEvent) => {
      const next: ThemePreference = resolveTheme(theme) === 'dark' ? 'light' : 'dark'
      const origin = event
        ? { x: event.clientX, y: event.clientY }
        : { x: window.innerWidth / 2, y: 16 }
      withThemeTransition(origin, () => {
        setTheme(next)
        applyTheme(resolveTheme(next))
      })
    },
    [theme, setTheme]
  )

  return { theme, resolved, setTheme, toggle }
}

/** 把主题写到 DOM、localStorage 与主进程窗口，全局只需在 App 里挂一次。 */
export function useThemeEffect(): void {
  const theme = useUiStore((state) => state.theme)

  useEffect(() => {
    writeThemePreference(theme)
    const apply = (): void => {
      applyTheme(resolveTheme(theme))
      void window.api?.window.setTheme(theme).catch(() => undefined)
    }
    apply()
    if (theme !== 'system') return
    return watchSystemTheme(apply)
  }, [theme])
}
