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
import { copyText } from '@/lib/clipboard'
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

type RowKind = 'hits' | 'array' | 'object'

interface ResultRow {
  id: string
  score: number
  values: Record<string, unknown>
}

interface CollectedRows {
  kind: RowKind
  columns: string[]
  rows: ResultRow[]
}

function collectRows(result: EsRunResult | null): CollectedRows {
  if (!result) return { kind: 'object', columns: [], rows: [] }
  const body = result.body

  // 搜索类响应：hits.hits
  if (isRecord(body) && isRecord(body.hits) && Array.isArray(body.hits.hits)) {
    const rows: ResultRow[] = []
    const columnSet = new Set<string>()
    for (const raw of body.hits.hits) {
      if (!isRecord(raw)) continue
      const source = isRecord(raw._source) ? raw._source : {}
      const flattened = flattenSource(source)
      for (const key of Object.keys(flattened)) columnSet.add(key)
      rows.push({ id: String(raw._id ?? ''), score: Number(raw._score ?? 0), values: flattened })
    }
    return { kind: 'hits', columns: [...columnSet], rows }
  }

  // _cat 类响应：顶层就是数组，每个元素是一行
  if (Array.isArray(body)) {
    const rows: ResultRow[] = []
    const columnSet = new Set<string>()
    body.forEach((item, position) => {
      if (!isRecord(item)) {
        rows.push({ id: String(position), score: 0, values: { value: item } })
        return
      }
      const flattened = flattenSource(item)
      for (const key of Object.keys(flattened)) columnSet.add(key)
      rows.push({ id: String(position), score: 0, values: flattened })
    })
    return { kind: 'array', columns: [...columnSet], rows }
  }

  // 其余对象（count、集群健康、mapping 等）：按「字段 / 值」两列展示
  if (isRecord(body)) {
    const flattened = flattenSource(body)
    return {
      kind: 'object',
      columns: ['字段', '值'],
      rows: Object.entries(flattened).map(([key, value]) => ({
        id: key,
        score: 0,
        values: { key, value }
      }))
    }
  }

  return { kind: 'object', columns: [], rows: [] }
}

const COLUMN_WIDTHS: Record<string, number> = {
  _id: 150,
  _score: 64,
  status: 84,
  '@timestamp': 168,
  'user.id': 116,
  latency_ms: 92
}

/** 表头：hover 时显示复制按钮，复制该列当前页的全部值（按行换行）。 */
function CopyableTh({
  label,
  values,
  width,
  minWidth
}: {
  label: string
  values: string[]
  width?: number
  minWidth?: number
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  const copy = async (): Promise<void> => {
    const copiedOk = await copyText(values.join('\n'))
    setCopied(copiedOk)
    if (copiedOk) window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <th
      className="group/th h-9 whitespace-nowrap border-b border-border px-3 text-left font-medium"
      style={{ width, minWidth }}
    >
      <span className="flex items-center gap-1">
        <span className="truncate">{label}</span>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={`复制列 ${label}`}
          title={`复制列 ${label}（当前页 ${values.length} 行）`}
          className={cn(
            'shrink-0 rounded-sm p-1 text-muted-foreground opacity-0 transition-colors hover:bg-accent hover:text-foreground group-hover/th:opacity-100',
            copied && 'bg-emerald-500/10 text-emerald-600 opacity-100 dark:text-emerald-400'
          )}
        >
          {copied ? (
            <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      </span>
    </th>
  )
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
  const { kind, columns, rows } = collectRows(result)
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
              {kind !== 'object' && rows.length > 0 ? (
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
          <ExportMenu
            result={result}
            kind={kind}
            rows={rows}
            columns={columns}
            index={indexName(result)}
          />
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
                className="animate-in fade-in-0 flex-1 select-text overflow-auto duration-200"
              >
                {kind === 'hits' ? (
                  rows.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      没有匹配的文档
                    </div>
                  ) : (
                    <table className="w-full border-collapse text-xs">
                      <thead className="sticky top-0 z-10 bg-muted/60 text-xs text-muted-foreground backdrop-blur">
                        <tr>
                          <CopyableTh label="_id" values={rows.map((row) => row.id)} width={150} />
                          <CopyableTh
                            label="_score"
                            values={rows.map((row) => row.score.toFixed(1))}
                            width={64}
                          />
                          {columns.map((column) => (
                            <CopyableTh
                              key={column}
                              label={column}
                              values={rows.map((row) => cellText(row.values[column]))}
                              width={COLUMN_WIDTHS[column] ?? 120}
                              minWidth={100}
                            />
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr
                            key={row.id}
                            className="h-9 border-b border-border/60 transition-colors hover:bg-muted/40"
                          >
                            <td className="max-w-[420px] truncate px-3 text-xs tabular-nums">
                              {row.id}
                            </td>
                            <td className="truncate px-3 text-xs tabular-nums text-muted-foreground">
                              {row.score.toFixed(1)}
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
                  )
                ) : kind === 'array' ? (
                  rows.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      没有返回行
                    </div>
                  ) : (
                    <table className="w-full border-collapse text-xs">
                      <thead className="sticky top-0 z-10 bg-muted/60 text-xs text-muted-foreground backdrop-blur">
                        <tr>
                          {columns.map((column) => (
                            <CopyableTh
                              key={column}
                              label={column}
                              values={rows.map((row) => cellText(row.values[column]))}
                              width={COLUMN_WIDTHS[column] ?? 120}
                              minWidth={100}
                            />
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, position) => (
                          <tr
                            key={`${row.id}-${position}`}
                            className="h-9 border-b border-border/60 transition-colors hover:bg-muted/40"
                          >
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
                  )
                ) : rows.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    响应为空
                  </div>
                ) : (
                  <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0 z-10 bg-muted/60 text-xs text-muted-foreground backdrop-blur">
                      <tr>
                        <CopyableTh
                          label="字段"
                          values={rows.map((row) => String(row.values.key))}
                          width={260}
                        />
                        <CopyableTh
                          label="值"
                          values={rows.map((row) => cellText(row.values.value))}
                        />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr
                          key={row.id}
                          className="border-b border-border/60 transition-colors hover:bg-muted/40"
                        >
                          <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                            {String(row.values.key)}
                          </td>
                          <td className="max-w-[720px] break-all px-3 py-2 align-top text-xs">
                            {cellText(row.values.value)}
                          </td>
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
  kind,
  rows,
  columns,
  index
}: {
  result: EsRunResult | null
  kind: RowKind
  rows: ResultRow[]
  columns: string[]
  index: string
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  const copyJson = async (): Promise<void> => {
    const copiedOk = await copyText(JSON.stringify(result?.body ?? {}, null, 2))
    setCopied(copiedOk)
    if (copiedOk) window.setTimeout(() => setCopied(false), 1500)
  }

  const exportCsv = (): void => {
    let header: string[] = []
    let bodyRows: unknown[][] = []
    if (kind === 'hits') {
      header = ['_id', '_score', ...columns]
      bodyRows = rows.map((row) => [row.id, row.score, ...columns.map((c) => row.values[c])])
    } else if (kind === 'array') {
      header = columns
      bodyRows = rows.map((row) => columns.map((column) => row.values[column]))
    } else {
      header = ['字段', '值']
      bodyRows = rows.map((row) => [String(row.values.key), cellText(row.values.value)])
    }
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

