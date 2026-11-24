import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Plus, Trash2, X } from 'lucide-react'
import type { ConnectionSummary, HistoryEntry, IndexSummary, SavedQuery } from '@shared/types'
import { formatCount } from '@shared/format'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConnections } from '@/lib/hooks/use-connections'
import { useIndices } from '@/lib/hooks/use-indices'
import { useHistory } from '@/lib/hooks/use-history'
import { useSaved } from '@/lib/hooks/use-saved'
import { useQueryStore } from '@/stores/query-store'
import { useUiStore } from '@/stores/ui-store'

const ENV_DOT: Record<ConnectionSummary['environment'], string> = {
  prod: 'bg-red-500',
  staging: 'bg-amber-500',
  dev: 'bg-blue-500'
}

const ENV_LABEL: Record<ConnectionSummary['environment'], string> = {
  prod: 'prod',
  staging: 'stg',
  dev: 'dev'
}

const HEALTH_DOT: Record<IndexSummary['health'], string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500'
}

function SectionHeader({
  expanded,
  onToggle,
  label,
  count,
  trailing
}: {
  expanded: boolean
  onToggle: () => void
  label: string
  count: number
  trailing?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex h-8 items-center rounded-md pr-1 transition-colors hover:bg-accent/60">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {expanded ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )}
        <span className="flex-1 text-left">{label}</span>
        {count > 0 ? (
          <span className="text-xs tabular-nums text-muted-foreground/70">{count}</span>
        ) : null}
      </button>
      {trailing}
    </div>
  )
}

export function Sidebar(): React.JSX.Element {
  const connectionId = useUiStore((state) => state.connectionId)
  const index = useUiStore((state) => state.index)
  const setIndex = useUiStore((state) => state.setIndex)
  const openConnectionDialog = useUiStore((state) => state.openConnectionDialog)
  const openSaveQuery = useUiStore((state) => state.openSaveQuery)
  const load = useQueryStore((state) => state.load)
  const update = useQueryStore((state) => state.update)
  const queryClient = useQueryClient()

  const { data: connections = [] } = useConnections()
  const { data: indices = [] } = useIndices(connectionId)
  const { data: history = [] } = useHistory(connectionId)
  const { data: saved = [] } = useSaved()
  const connectionSaved = saved.filter((item) => item.connectionId === connectionId)

  const [savedOpen, setSavedOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)

  useEffect(() => {
    setSavedOpen(false)
    setHistoryOpen(false)
  }, [connectionId])

  const activeConnection = useMemo(
    () => connections.find((connection) => connection.id === connectionId) ?? null,
    [connections, connectionId]
  )

  const openIndex = (entry: IndexSummary): void => {
    if (!connectionId) return
    setIndex(entry.name)
    load(connectionId, entry.name)
  }

  const replaySaved = (item: SavedQuery): void => {
    if (!item.index) return
    setIndex(item.index)
    load(item.connectionId, item.index)
    update({
      tree: item.tree,
      options: item.options,
      dslText: item.dslText,
      mode: 'builder',
      operationId: 'search',
      page: 0
    })
  }

  const replayHistory = (entry: HistoryEntry): void => {
    if (!entry.index) return
    setIndex(entry.index)
    load(entry.connectionId, entry.index)
    update({ operationId: entry.operationId, page: 0 })
  }

  const removeSaved = async (id: string): Promise<void> => {
    await api.saved.remove(id)
    await queryClient.invalidateQueries({ queryKey: ['saved'] })
  }

  const clearHistory = async (): Promise<void> => {
    await api.history.clear()
    await queryClient.invalidateQueries({ queryKey: ['history'] })
    setClearOpen(false)
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex h-10 shrink-0 items-center justify-between px-3">
        <span className="text-xs font-medium text-muted-foreground">资源</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="新建连接"
              onClick={() => openConnectionDialog()}
            >
              <Plus className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>新建连接</TooltipContent>
        </Tooltip>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {activeConnection ? (
          <>
            <div className="flex h-8 items-center gap-2 rounded-md px-1.5">
              <span
                className={cn('size-2 shrink-0 rounded-full', ENV_DOT[activeConnection.environment])}
              />
              <span className="min-w-0 flex-1 truncate text-xs font-medium">
                {activeConnection.name}
              </span>
              <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-xs">
                {ENV_LABEL[activeConnection.environment]}
              </Badge>
            </div>

            <div className="mt-0.5 space-y-px">
              {indices.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">没有索引</p>
              ) : (
                indices.map((entry) => {
                  const active = entry.name === index
                  return (
                    <button
                      key={entry.name}
                      type="button"
                      onClick={() => openIndex(entry)}
                      title={entry.name}
                      className={cn(
                        'group flex h-8 w-full items-center gap-2 rounded-md pl-3 pr-1.5 text-left transition-colors',
                        active
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                      )}
                    >
                      <span
                        className={cn('size-1.5 shrink-0 rounded-full', HEALTH_DOT[entry.health])}
                      />
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-xs',
                          active && 'text-foreground'
                        )}
                      >
                        {entry.name}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">
                        {formatCount(entry.docsCount)}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </>
        ) : (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            还没有选中连接，点资源树右上角的 + 新建连接。
          </p>
        )}

        <Separator className="my-2" />

        <SectionHeader
          expanded={savedOpen}
          onToggle={() => setSavedOpen((open) => !open)}
          label="收藏查询"
          count={connectionSaved.length}
        />
        {savedOpen ? (
          connectionSaved.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">还没有收藏</p>
          ) : (
            <div className="animate-in fade-in-0 slide-in-from-top-1 space-y-px duration-150">
              {connectionSaved.map((item) => (
                <div
                  key={item.id}
                  className="group flex h-8 items-center rounded-md pl-6 pr-1 transition-colors hover:bg-accent/60"
                >
                  <button
                    type="button"
                    onClick={() => replaySaved(item)}
                    className="min-w-0 flex-1 truncate text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {item.name}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-6 shrink-0 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                    aria-label="删除收藏"
                    onClick={() => void removeSaved(item.id)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )
        ) : null}

        <SectionHeader
          expanded={historyOpen}
          onToggle={() => setHistoryOpen((open) => !open)}
          label="历史记录"
          count={history.length}
          trailing={
            history.length > 0 ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-6 text-muted-foreground hover:text-destructive"
                    aria-label="清空历史记录"
                    onClick={() => setClearOpen(true)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>清空历史记录</TooltipContent>
              </Tooltip>
            ) : undefined
          }
        />
        {historyOpen ? (
          history.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">还没有执行记录</p>
          ) : (
            <div className="animate-in fade-in-0 slide-in-from-top-1 space-y-px duration-150">
              {history.slice(0, 30).map((entry) => {
                const failed = entry.status === 'error' || entry.status >= 400
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => replayHistory(entry)}
                    className="flex h-8 w-full items-center gap-2 rounded-md pl-6 pr-1.5 text-left transition-colors hover:bg-accent/60"
                  >
                    <span
                      className={cn(
                        'size-1.5 shrink-0 rounded-full',
                        failed ? 'bg-red-500' : 'bg-emerald-500'
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {entry.index ? `${entry.index}/${entry.operationId}` : entry.operationId}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">
                      {entry.durationMs}ms
                    </span>
                  </button>
                )
              })}
            </div>
          )
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => openSaveQuery()}
        className="flex h-10 shrink-0 items-center gap-2 border-t border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
      >
        <Plus className="size-3.5" />
        保存当前查询
      </button>

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>清空历史记录</DialogTitle>
            <DialogDescription>
              将删除当前连接的全部执行记录，收藏查询不受影响。此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void clearHistory()}>
              清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  )
}
