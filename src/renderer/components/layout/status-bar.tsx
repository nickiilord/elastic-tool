import { useMemo } from 'react'
import { formatBytes } from '@shared/format'
import { useConnections } from '@/lib/hooks/use-connections'
import { useMetrics } from '@/lib/hooks/use-metrics'
import { useAppInfo } from '@/lib/hooks/use-app-info'
import { useUiStore } from '@/stores/ui-store'
import { cn } from '@/lib/utils'

const LOCALE_LABEL: Record<string, string> = {
  'zh-CN': '中文',
  'en-US': 'English'
}

export function StatusBar(): React.JSX.Element {
  const { data: connections = [] } = useConnections()
  const connectionId = useUiStore((state) => state.connectionId)
  const metrics = useMetrics()
  const { data: info } = useAppInfo()

  const active = useMemo(
    () => connections.find((connection) => connection.id === connectionId) ?? connections[0],
    [connections, connectionId]
  )

  const timezone = info?.timezone ?? 'UTC'
  const locale = LOCALE_LABEL[info?.locale ?? 'zh-CN'] ?? info?.locale ?? '中文'

  return (
    <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-border bg-muted/30 px-3 text-xs text-muted-foreground">
      <span
        className={cn(
          'size-1.5 rounded-full',
          active?.status === 'connected' ? 'bg-emerald-500' : 'bg-muted-foreground/40'
        )}
      />
      <span>{active?.name ?? '未连接'}</span>
      {active?.version ? <span>v{active.version}</span> : null}
      {active?.readOnly ? <span>只读模式</span> : null}
      {active?.latencyMs ? <span>握手 {active.latencyMs} ms</span> : null}
      <span className="flex-1" />
      <span className="tabular-nums">{metrics ? formatBytes(metrics.rssBytes) : '—'}</span>
      <span>{locale}</span>
      <span>{timezone}</span>
    </footer>
  )
}
