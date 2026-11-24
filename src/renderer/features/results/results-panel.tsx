import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileBraces,
  FileSpreadsheet,
  Table2
} from 'lucide-react'
import type { EsErrorPayload, EsRunResult, ResultTab } from '@shared/types'
import { formatDuration, formatNumber } from '@shared/format'
import { cn } from '@/lib/utils'
import { downloadText } from '@/lib/download'
import { toCsv } from '@shared/export'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

export interface ResultsProps {
  status: 'idle' | 'running' | 'done' | 'error'
  result: EsRunResult | null
  error: EsErrorPayload | null
  tab: ResultTab
  onTabChange: (tab: ResultTab) => void
  /** 只有搜索类操作才分页 */
  paginated?: boolean
  page?: number
  pageSize?: number
  onPageChange?: (page: number) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function flattenSource(source: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (isRecord(value) && !Array.isArray(value)) {
      Object.assign(out, flattenSource(value, path))
    } else {
      out[path] = value
    }
  }
  return out
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function collectRows(result: EsRunResult | null): {
  columns: string[]
  rows: Array<{ _id: string; _score: number; values: Record<string, unknown> }>
} {
  if (!result || !isRecord(result.body)) return { columns: [], rows: [] }
  const hitsContainer = isRecord(result.body.hits) ? result.body.hits : null
  const rawHits = hitsContainer && Array.isArray(hitsContainer.hits) ? hitsContainer.hits : []
  const rows: Array<{ _id: string; _score: number; values: Record<string, unknown> }> = []
  const columnSet = new Set<string>()

  for (const raw of rawHits) {
    if (!isRecord(raw)) continue
    const source = isRecord(raw._source) ? raw._source : {}
    const flattened = flattenSource(source)
    for (const key of Object.keys(flattened)) columnSet.add(key)
    rows.push({
      _id: String(raw._id ?? ''),
      _score: Number(raw._score ?? 0),
      values: flattened
    })
  }

  return { columns: [...columnSet], rows }
}

const COLUMN_WIDTHS: Record<string, number> = {
  _id: 150,
  _score: 64,
  status: 84,
  '@timestamp': 168,
  'user.id': 116,
  latency_ms: 92
}

export function ResultsPanel({
  status,
  result,
  error,
  tab,
  onTabChange,
  paginated = false,
  page = 0,
  pageSize = 20,
  onPageChange
}: ResultsProps): React.JSX.Element {
  const { columns, rows } = collectRows(result)
  const total = result?.total
  const running = status === 'running'
  const failed = status === 'error'
  const canRun = Boolean(result || error || running)
  const statusOk = Boolean(result && result.status >= 200 && result.status < 300)

  const pageCount =
    typeof total === 'number' && pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1
  const showPager = Boolean(paginated && onPageChange && result && typeof total === 'number')
  const contentRef = useRef<HTMLDivElement>(null)

  // 翻页后回到结果区顶部
  useEffect(() => {
    const container = contentRef.current?.querySelector<HTMLElement>('[data-slot="tabs-content"]')
    container?.scrollTo({ top: 0 })
  }, [page])

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-border">
      <Tabs
        value={tab}
        onValueChange={(value) => onTabChange(value as ResultTab)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-2">
          <TabsList variant="line">
            <TabsTrigger value="table" className="gap-1 px-3">
              表格
              {rows.length > 0 ? (
                <Badge variant="secondary" className="px-1 tabular-nums">
                  {rows.length}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="json" className="px-3">
              JSON
            </TabsTrigger>
            <TabsTrigger value="aggs" className="gap-1 px-3">
              聚合
              {aggregateCount(result) ? (
                <Badge variant="secondary" className="px-1 tabular-nums">
                  {aggregateCount(result)}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="profile" className="px-3">
              Profile
            </TabsTrigger>
          </TabsList>
          <span className="flex-1" />
          {showPager ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-xs tabular-nums text-muted-foreground">
                第 {page + 1} / {pageCount} 页
              </span>
              <Button
                variant="outline"
                size="icon-xs"
                className="size-7"
                aria-label="上一页"
                disabled={page <= 0}
                onClick={() => onPageChange?.(page - 1)}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon-xs"
                className="size-7"
                aria-label="下一页"
                disabled={page + 1 >= pageCount}
                onClick={() => onPageChange?.(page + 1)}
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          ) : null}
          <ExportMenu result={result} rows={rows} columns={columns} index={indexName(result)} />
        </div>

        <div className="flex h-8 shrink-0 items-center gap-3 overflow-hidden border-b border-border px-3 text-xs text-muted-foreground">
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              failed
                ? 'bg-red-500'
                : running
                  ? 'animate-breathe bg-amber-500'
                  : result
                    ? statusOk
                      ? 'bg-emerald-500'
                      : 'bg-red-500'
                    : 'bg-muted-foreground/40'
            )}
          />
          {running ? (
            <span>运行中…</span>
          ) : failed ? (
            <span className="min-w-0 truncate text-destructive">
              {error?.message ?? '请求失败'}
            </span>
          ) : !result ? (
            <span>等待运行</span>
          ) : (
            <>
              <span
                className={cn(
                  'shrink-0 tabular-nums',
                  statusOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                )}
              >
                {result.status} {result.statusText}
              </span>
              {result.shards ? (
                <span className="shrink-0">
                  {result.shards.successful} / {result.shards.total} 分片成功
                </span>
              ) : null}
              <span className="shrink-0">
                往返{' '}
                <span className="tabular-nums text-foreground/80">
                  {formatDuration(result.durationMs)}
                </span>
              </span>
              {typeof total === 'number' ? (
                <span className="shrink-0">
                  命中{' '}
                  <span className="tabular-nums text-foreground/80">{formatNumber(total)}</span> 条
                </span>
              ) : null}
            </>
          )}
        </div>

        <div ref={contentRef} className="flex min-h-0 flex-1 flex-col">
          {!canRun ? (
            <div className="animate-in fade-in-0 flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground duration-200">
              <Table2 className="size-5 opacity-40" />
              <span>运行查询后，结果会显示在这里</span>
            </div>
          ) : running ? (
            <div className="animate-in fade-in-0 flex-1 space-y-2 overflow-auto p-3 duration-200">
              <Skeleton className="h-9 w-full" />
              {Array.from({ length: 6 }).map((_, position) => (
                <Skeleton key={position} className="h-9 w-full" />
              ))}
            </div>
          ) : failed ? (
            <div className="animate-in fade-in-0 flex-1 overflow-auto p-3 duration-200">
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-destructive">
                      {error?.message ?? '请求失败'}
                    </p>
                    {error?.type ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        type: {error.type}
                      </p>
                    ) : null}
                  </div>
                </div>
                {error?.body ? (
                  <pre className="mt-3 max-h-64 select-text overflow-auto rounded-sm border border-border/60 bg-background/60 p-3 font-mono text-xs leading-5">
                    {JSON.stringify(error.body, null, 2)}
                  </pre>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <TabsContent
                value="table"
                className="animate-in fade-in-0 flex-1 overflow-auto duration-200"
              >
                {rows.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    没有匹配的文档
                  </div>
                ) : (
                  <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0 z-10 bg-muted/60 text-xs text-muted-foreground backdrop-blur">
                      <tr>
                        <th
                          className="h-9 whitespace-nowrap border-b border-border px-3 text-left font-medium"
                          style={{ width: 150 }}
                        >
                          _id
                        </th>
                        <th
                          className="h-9 whitespace-nowrap border-b border-border px-3 text-left font-medium"
                          style={{ width: 64 }}
                        >
                          _score
                        </th>
                        {columns.map((column) => (
                          <th
                            key={column}
                            className="h-9 whitespace-nowrap border-b border-border px-3 text-left font-medium"
                            style={{ width: COLUMN_WIDTHS[column] ?? 120, minWidth: 100 }}
                          >
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr
                          key={row._id}
                          className="h-9 border-b border-border/60 transition-colors hover:bg-muted/40"
                        >
                          <td className="max-w-[420px] truncate px-3 text-xs tabular-nums">
                            {row._id}
                          </td>
                          <td className="truncate px-3 text-xs tabular-nums text-muted-foreground">
                            {row._score.toFixed(1)}
                          </td>
                          {columns.map((column) => (
                            <td
                              key={column}
                              className={cn(
                                'max-w-[420px] truncate px-3 text-xs',
                                cellTone(column, row.values[column])
                              )}
                            >
                              {cellText(row.values[column])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </TabsContent>

              <TabsContent
                value="json"
                className="animate-in fade-in-0 flex-1 overflow-auto duration-200"
              >
                <pre className="select-text whitespace-pre-wrap break-words p-4 font-mono text-xs leading-5 text-foreground/90">
                  {JSON.stringify(result?.body ?? {}, null, 2)}
                </pre>
              </TabsContent>

              <TabsContent
                value="aggs"
                className="animate-in fade-in-0 flex-1 overflow-auto duration-200"
              >
                {renderAggregations(result)}
              </TabsContent>

              <TabsContent
                value="profile"
                className="animate-in fade-in-0 flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground duration-200"
              >
                Profile 视图在接入真实集群后显示查询各阶段耗时
              </TabsContent>
            </>
          )}
        </div>
      </Tabs>
    </div>
  )
}

function aggregateCount(result: EsRunResult | null): number | undefined {
  if (!result || !isRecord(result.body)) return undefined
  if (!isRecord(result.body.aggregations)) return undefined
  return Object.keys(result.body.aggregations).length
}

function indexName(result: EsRunResult | null): string {
  if (!result || !isRecord(result.body)) return 'results'
  const hitsContainer = isRecord(result.body.hits) ? result.body.hits : null
  const first = hitsContainer && Array.isArray(hitsContainer.hits) ? hitsContainer.hits[0] : null
  if (isRecord(first) && typeof first._index === 'string') return first._index
  return 'results'
}

function cellTone(column: string, value: unknown): string {
  if (column === 'status') {
    if (value === 'active') return 'text-emerald-600 dark:text-emerald-400'
    if (value === 'pending') return 'text-amber-600 dark:text-amber-400'
    if (value === 'error' || value === 'failed') return 'text-destructive'
  }
  if (column === 'http.status') {
    const code = Number(value)
    if (code >= 500) return 'text-destructive'
    if (code >= 400) return 'text-amber-600 dark:text-amber-400'
    if (code >= 200 && code < 300) return 'text-emerald-600 dark:text-emerald-400'
  }
  return ''
}

function ExportMenu({
  result,
  rows,
  columns,
  index
}: {
  result: EsRunResult | null
  rows: Array<{ _id: string; _score: number; values: Record<string, unknown> }>
  columns: string[]
  index: string
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  const copyJson = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(result?.body ?? {}, null, 2))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  const exportCsv = (): void => {
    const header = ['_id', '_score', ...columns]
    const bodyRows = rows.map((row) => [
      row._id,
      row._score,
      ...columns.map((column) => row.values[column])
    ])
    downloadText(`${index}-results.csv`, toCsv(header, bodyRows), 'text/csv;charset=utf-8')
  }

  const exportJson = (): void => {
    downloadText(
      `${index}-results.json`,
      JSON.stringify(result?.body ?? {}, null, 2),
      'application/json'
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1 px-3 active:scale-[0.98]">
          <Download className="size-3.5" />
          导出
          <ChevronDown className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            void copyJson()
          }}
        >
          {copied ? (
            <Check className="text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Copy />
          )}
          {copied ? '已复制' : '复制 JSON'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={exportCsv}>
          <FileSpreadsheet />
          导出 CSV
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={exportJson}>
          <FileBraces />
          导出 JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function renderAggregations(result: EsRunResult | null): React.JSX.Element {
  if (!result || !isRecord(result.body) || !isRecord(result.body.aggregations)) {
    return <p className="p-4 text-sm text-muted-foreground">这次请求没有聚合结果</p>
  }
  const aggregations = result.body.aggregations
  return (
    <div className="space-y-3 p-3">
      {Object.entries(aggregations).map(([name, value]) => {
        const buckets = isRecord(value) && Array.isArray(value.buckets) ? value.buckets : []
        const max = Math.max(
          1,
          ...buckets.map((entry) => (isRecord(entry) ? Number(entry.doc_count ?? 0) : 0))
        )
        return (
          <section key={name} className="overflow-hidden rounded-md border border-border/60">
            <header className="flex h-8 items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-3">
              <span className="truncate text-xs font-medium">{name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {buckets.length} 个桶
              </span>
            </header>
            {buckets.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">没有桶</p>
            ) : (
              <div className="space-y-2 px-3 py-3">
                {buckets.map((bucket, position) => {
                  const key = isRecord(bucket) ? String(bucket.key ?? position) : String(position)
                  const count = isRecord(bucket) ? Number(bucket.doc_count ?? 0) : 0
                  return (
                    <div key={`${name}-${key}`}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate">{key}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {formatNumber(count)}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${(count / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

