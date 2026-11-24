import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Search } from 'lucide-react'
import type { FieldSchema } from '@shared/types'
import { appendCondition, createCondition } from '@shared/query/tree'
import { defaultConditionForField } from '@shared/query/values'
import { relativeTime } from '@shared/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TypeBadge } from '@/components/common/type-badge'
import { useSchema } from '@/lib/hooks/use-schema'
import { useQueryDocument, useQueryStore } from '@/stores/query-store'
import { useUiStore } from '@/stores/ui-store'
import { useQueryClient } from '@tanstack/react-query'

export function FieldPanel(): React.JSX.Element {
  const connectionId = useUiStore((state) => state.connectionId)
  const index = useUiStore((state) => state.index)
  const document = useQueryDocument()
  const updateTree = useQueryStore((state) => state.updateTree)
  const fieldPanelOpen = useUiStore((state) => state.fieldPanelOpen)
  const toggleFieldPanel = useUiStore((state) => state.toggleFieldPanel)
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')

  const { data: schema, isLoading } = useSchema(connectionId, index)
  const [refreshing, setRefreshing] = useState(false)

  const rows = useMemo(() => {
    if (!schema) return []
    const flat: Array<{ field: FieldSchema; depth: number }> = []
    const visit = (fields: FieldSchema[], depth: number): void => {
      for (const field of fields) {
        flat.push({ field, depth })
        if (field.children) visit(field.children, depth + 1)
      }
    }
    visit(schema.fields, 0)
    return flat
  }, [schema])

  const filtered = rows.filter(
    (row) => !query || row.field.path.toLowerCase().includes(query.toLowerCase())
  )

  const addField = (field: FieldSchema): void => {
    if (!document) return
    const { operator, value } = defaultConditionForField(field)
    const condition = createCondition(field.path, operator, value)
    updateTree(appendCondition(document.tree, condition))
  }

  const refresh = async (): Promise<void> => {
    if (!connectionId || !index) return
    setRefreshing(true)
    try {
      await window.api.indices.refreshSchema(connectionId, index)
      await queryClient.invalidateQueries({ queryKey: ['schema', connectionId, index] })
    } finally {
      setRefreshing(false)
    }
  }

  if (!fieldPanelOpen) {
    return (
      <aside className="flex w-10 shrink-0 flex-col items-center border-l border-border bg-sidebar py-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="展开字段面板" onClick={toggleFieldPanel}>
              <ChevronLeft className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>展开字段面板</TooltipContent>
        </Tooltip>
      </aside>
    )
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-l border-border bg-sidebar">
      <div className="flex h-10 shrink-0 items-center gap-2 px-3">
        <span className="text-xs font-medium text-muted-foreground">字段</span>
        <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-xs tabular-nums">
          {schema ? rows.length : 0}
        </Badge>
        <span className="flex-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label="折叠字段面板" onClick={toggleFieldPanel}>
              <ChevronRight className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>折叠字段面板</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="刷新 mapping"
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>刷新 mapping</TooltipContent>
        </Tooltip>
      </div>

      <div className="px-2 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索字段"
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {isLoading ? (
          <div className="space-y-1 px-1 py-1">
            {Array.from({ length: 10 }).map((_, position) => (
              <Skeleton key={position} className="h-8 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">没有匹配的字段</p>
        ) : (
          <div className="space-y-px">
            {filtered.map(({ field, depth }) => (
              <div
                key={field.path}
                className="group flex h-8 items-center gap-1.5 rounded-md pr-1 transition-colors hover:bg-accent/60"
                style={{ paddingLeft: 6 + depth * 12 }}
                title={field.path}
              >
                <span className="min-w-0 flex-1 truncate text-xs text-foreground/80">
                  {field.path}
                </span>
                <TypeBadge type={field.type} />
                {!field.children ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="添加条件"
                    onClick={() => addField(field)}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
        <span className="truncate">mapping · {schema ? relativeTime(schema.cachedAt) : '—'}</span>
        <span className="flex-1" />
        <button
          type="button"
          className="shrink-0 text-foreground underline-offset-4 transition-colors hover:underline"
          onClick={() => void refresh()}
        >
          刷新
        </button>
      </div>
    </aside>
  )
}
