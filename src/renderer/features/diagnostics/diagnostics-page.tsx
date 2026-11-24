import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, RefreshCw, Terminal } from 'lucide-react'
import type { ClusterDiagnostics } from '@shared/types'
import { formatBytes, formatNumber, relativeTime } from '@shared/format'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConnections } from '@/lib/hooks/use-connections'
import { useUiStore } from '@/stores/ui-store'

const HEALTH_DOT: Record<ClusterDiagnostics['health']['status'], string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500'
}

const HEALTH_TEXT: Record<ClusterDiagnostics['health']['status'], string> = {
  green: 'text-emerald-600 dark:text-emerald-400',
  yellow: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-600 dark:text-red-400'
}

const HEALTH_LABEL: Record<ClusterDiagnostics['health']['status'], string> = {
  green: '正常',
  yellow: '警告',
  red: '异常'
}

export function DiagnosticsPage(): React.JSX.Element {
  const connectionId = useUiStore((state) => state.connectionId)
  const { data: connections = [] } = useConnections()
  const connection = connections.find((entry) => entry.id === connectionId)

  const [autoRefresh, setAutoRefresh] = useState(true)
  const [hotOpen, setHotOpen] = useState(false)
  const [hotText, setHotText] = useState<string | null>(null)
  const [hotLoading, setHotLoading] = useState(false)

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['diagnostics', connectionId],
    queryFn: () => api.cluster.diagnostics(connectionId as string),
    enabled: Boolean(connectionId),
    refetchInterval: autoRefresh ? 10_000 : false
  })

  const loadHotThreads = async (): Promise<void> => {
    if (!connectionId) return
    setHotLoading(true)
    try {
      const text = await api.cluster.hotThreads(connectionId)
      setHotText(text)
      setHotOpen(true)
    } finally {
      setHotLoading(false)
    }
  }

  const maxPoolQueue = data ? Math.max(1, ...data.threadPools.map((pool) => pool.queue)) : 1

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      <div className="flex h-13 shrink-0 items-center gap-2 border-b border-border px-4">
        <h1 className="text-base font-medium">集群诊断</h1>
        <span className="h-4 w-px bg-border" />
        <span className="max-w-40 truncate text-xs text-muted-foreground">
          {connection?.name ?? '未连接'}
        </span>
        {data ? (
          <>
            <span
              className={cn(
                'size-2 shrink-0 rounded-full',
                HEALTH_DOT[data.health.status],
                isFetching && 'animate-breathe'
              )}
            />
            <span className={cn('text-xs', HEALTH_TEXT[data.health.status])}>
              {HEALTH_LABEL[data.health.status]}
            </span>
          </>
        ) : null}
        <span className="flex-1" />
        <div className="flex items-center gap-2">
          <Label
            htmlFor="diagnostics-auto-refresh"
            className="text-xs font-normal text-muted-foreground"
          >
            自动刷新 10s
          </Label>
          <Switch
            id="diagnostics-auto-refresh"
            checked={autoRefresh}
            onCheckedChange={setAutoRefresh}
          />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
              刷新
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            刷新诊断数据 <Kbd>F5</Kbd>
          </TooltipContent>
        </Tooltip>
        <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {data ? relativeTime(data.fetchedAt) : isLoading ? '加载中…' : '—'}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {error ? (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>诊断数据加载失败：{error instanceof Error ? error.message : '未知错误'}</span>
          </div>
        ) : null}

        {isLoading || !data ? (
          <div className="grid gap-4">
            <div className="grid grid-cols-5 divide-x divide-border overflow-hidden rounded-lg border border-border">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="p-3">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="mt-2 h-5 w-12" />
                  <Skeleton className="mt-2 h-3 w-24" />
                </div>
              ))}
            </div>
            <div className="grid gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-32" />
              ))}
            </div>
          </div>
        ) : (
          <div className="grid animate-in gap-4 fade-in-0 duration-200">
            <div className="grid grid-cols-5 divide-x divide-border overflow-hidden rounded-lg border border-border">
              <MetricCell
                label="集群状态"
                value={HEALTH_LABEL[data.health.status]}
                dotClassName={HEALTH_DOT[data.health.status]}
                valueClassName={HEALTH_TEXT[data.health.status]}
                footer={`${data.health.unassignedShards} 个分片未分配 · ${data.health.indices} 个索引`}
              />
              <MetricCell
                label="节点"
                value={`${data.nodes.online} / ${data.nodes.total}`}
                footer={`全部在线 · ${data.nodes.dedicatedMasters} 个专用 master`}
              />
              <MetricCell
                label="分片"
                value={formatNumber(data.shards.total)}
                footer={`主 ${data.shards.primary} / 副 ${data.shards.replica} / 未分配 ${data.shards.unassigned}`}
              />
              <MetricCell
                label="最高磁盘水位"
                value={`${data.disk.highestPercent} %`}
                valueClassName="text-amber-600 dark:text-amber-400"
                footer={`${data.disk.node} · 高于 ${data.disk.watermarkPercent}% 水位线`}
              />
              <MetricCell
                label="线程池拒绝"
                value={formatNumber(data.threadPoolRejections.total)}
                valueClassName="text-red-600 dark:text-red-400"
                footer={`${data.threadPoolRejections.pool} 池 · ${data.threadPoolRejections.window}`}
              />
            </div>

            <section className="grid gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium">未分配分片</h2>
                <span className="text-xs text-muted-foreground">
                  {data.unassigned.length}
                </span>
                <span className="flex-1" />
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                  查看 allocation explain 原文
                </button>
              </div>
              {data.unassigned.length === 0 ? (
                <div className="border-l-2 border-emerald-500 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
                  没有未分配分片，集群分片状态正常。
                </div>
              ) : (
                <div className="grid gap-1.5">
                  {data.unassigned.map((entry) => (
                    <div
                      key={`${entry.index}-${entry.shard}`}
                      className="animate-in fade-in-0 slide-in-from-top-1 border-l-2 border-red-500 bg-muted/30 px-3 py-2 duration-150"
                    >
                      <p className="text-xs text-muted-foreground">
                        {entry.index} [{entry.shard}] {entry.role} · {entry.node}
                      </p>
                      <p className="mt-1 text-sm leading-5">
                        <span className="text-muted-foreground">原因 · </span>
                        {entry.reason}
                      </p>
                      <p className="text-sm leading-5 text-muted-foreground">
                        建议 · {entry.suggestion}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="grid gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium">线程池</h2>
                <span className="text-xs text-muted-foreground">
                  条长为队列长度，拒绝数非零高亮
                </span>
                <span className="flex-1" />
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                  全部 {data.threadPools.length} 个池
                </button>
              </div>
              <div className="grid gap-1">
                {data.threadPools.map((pool) => {
                  const ratio = Math.min(1, pool.queue / maxPoolQueue)
                  const tone =
                    pool.rejected > 0
                      ? 'bg-red-500'
                      : pool.queue > 0
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  return (
                    <div key={pool.name} className="flex h-8 items-center gap-3">
                      <span className="w-32 shrink-0 truncate text-xs">{pool.name}</span>
                      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn('h-full rounded-full', tone)}
                          style={{ width: `${ratio * 100}%` }}
                        />
                      </div>
                      <span
                        className={cn(
                          'w-52 shrink-0 whitespace-nowrap text-right text-xs tabular-nums',
                          pool.rejected > 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-muted-foreground'
                        )}
                      >
                        队列 {pool.queue} · 拒绝 {pool.rejected} · 活跃 {pool.active}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="grid gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium">节点</h2>
                <span className="text-xs text-muted-foreground">
                  CPU / 堆 / 磁盘水位，超过 85% 水位线的项标黄
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {data.nodeStats.map((node) => (
                  <div
                    key={node.name}
                    className={cn(
                      'rounded-lg border border-border px-3 py-3',
                      node.diskWatermarkExceeded && 'border-amber-500/40'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">{node.name}</p>
                      {node.diskWatermarkExceeded ? (
                        <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">
                          水位超限
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {node.roles.join(' · ')}
                    </p>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <NodeMetric label="CPU" value={`${node.cpuPercent}%`} />
                      <NodeMetric label="堆" value={`${node.heapPercent}%`} />
                      <NodeMetric
                        label="磁盘"
                        value={`${node.diskPercent}%`}
                        warn={node.diskWatermarkExceeded}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      已分配 {node.assignedShards} 分片
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-lg border border-border px-3 py-2">
              <InlineMetric label="段数" value={formatNumber(data.segments.count)} />
              <InlineMetric
                label="合并进行中"
                value={formatNumber(data.segments.mergesInProgress)}
              />
              <InlineMetric label="query cache 命中" value={`${data.queryCacheHitPercent}%`} />
              <InlineMetric label="fielddata 占用" value={formatBytes(data.fielddataBytes)} />
              <span className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadHotThreads()}
                disabled={hotLoading}
              >
                <Terminal className="size-4" />
                {hotLoading ? '抓取中…' : '抓取 hot threads'}
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={hotOpen} onOpenChange={setHotOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>hot threads</DialogTitle>
            <DialogDescription>
              线程池栈快照，用于定位长时间占用 CPU 或阻塞的线程。
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted/50 p-4 font-mono text-xs leading-5">
            {hotText ?? '加载中…'}
          </pre>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">关闭</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function MetricCell({
  label,
  value,
  footer,
  valueClassName,
  dotClassName
}: {
  label: string
  value: string
  footer: string
  valueClassName?: string
  dotClassName?: string
}): React.JSX.Element {
  return (
    <div className="min-w-0 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 flex items-center gap-1.5 text-sm font-medium tabular-nums', valueClassName)}>
        {dotClassName ? <span className={cn('size-2 rounded-full', dotClassName)} /> : null}
        {value}
      </p>
      <p className="mt-1 text-xs leading-4 text-muted-foreground">{footer}</p>
    </div>
  )
}

function NodeMetric({
  label,
  value,
  warn
}: {
  label: string
  value: string
  warn?: boolean
}): React.JSX.Element {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-sm font-medium tabular-nums',
          warn && 'text-amber-600 dark:text-amber-400'
        )}
      >
        {value}
      </p>
    </div>
  )
}

function InlineMetric({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium tabular-nums">{value}</p>
    </div>
  )
}
