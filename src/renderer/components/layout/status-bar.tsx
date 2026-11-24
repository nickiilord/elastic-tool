import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { formatBytes } from '@shared/format'
import { useConnectionStatus, useConnections } from '@/lib/hooks/use-connections'
import { useMetrics } from '@/lib/hooks/use-metrics'
import { useAppInfo } from '@/lib/hooks/use-app-info'
import { friendlyConnectionError } from '@/lib/errors'
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
  const status = useConnectionStatus(connectionId)
  const queryClient = useQueryClient()

  const active = useMemo(
    () => connections.find((connection) => connection.id === connectionId) ?? connections[0],
    [connections, connectionId]
  )

  const timezone = info?.timezone ?? 'UTC'
  const locale = LOCALE_LABEL[info?.locale ?? 'zh-CN'] ?? info?.locale ?? '中文'
  const probe = status.data
  const failure = probe && !probe.ok ? friendlyConnectionError(probe.error ?? '') : null

  const retry = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['connection-status', connectionId] })
    void queryClient.invalidateQueries({ queryKey: ['indices'] })
    void queryClient.invalidateQueries({ queryKey: ['schema'] })
    void queryClient.invalidateQueries({ queryKey: ['diagnostics'] })
  }

  return (
    <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-border bg-muted/30 px-3 text-xs text-muted-foreground">
      <span
        className={cn(
          'size-1.5 rounded-full',
          probe ? (probe.ok ? 'bg-emerald-500' : 'bg-red-500') : 'bg-muted-foreground/40'
        )}
        title={probe ? (probe.ok ? '已连接' : failure?.title ?? '连接失败') : '正在检测连接'}
      />
      <span>{active?.name ?? '未连接'}</span>
      {probe?.ok && probe.version ? <span>v{probe.version}</span> : null}
      {active?.readOnly ? <span>只读模式</span> : null}
      {probe?.ok ? <span className="tabular-nums">握手 {probe.latencyMs} ms</span> : null}
      {failure ? (
        <>
          <span className="text-red-600 dark:text-red-400">{failure.title}</span>
          <button
            type="button"
            onClick={retry}
            className="flex items-center gap-1 text-blue-600 transition-colors hover:underline dark:text-blue-400"
          >
            <RefreshCw className={cn('size-3', status.isFetching && 'animate-spin')} />
            重试
          </button>
        </>
      ) : null}
      <span className="flex-1" />
      <span className="tabular-nums">{metrics ? formatBytes(metrics.rssBytes) : '—'}</span>
      <span>{locale}</span>
      <span>{timezone}</span>
    </footer>
  )
}
