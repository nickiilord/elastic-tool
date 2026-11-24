import { useState } from 'react'
import { Check, ChevronDown, Copy, Play, RotateCw, Terminal } from 'lucide-react'
import { buildPath, getOperation, listOperations } from '@shared/operations'
import type { OperationId } from '@shared/operations'
import { cn, toggleActiveClass } from '@/lib/utils'
import { copyText } from '@/lib/clipboard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const OPERATION_GROUPS = ['搜索与聚合', '索引', '集群', '写入'] as const

export function RequestBar({
  mode,
  onModeChange,
  operationId,
  onOperationChange,
  index,
  connectionId,
  dslText,
  docId,
  needsDocId,
  onDocIdChange,
  readOnly,
  onRun,
  running,
  canRun
}: {
  mode: 'builder' | 'dsl'
  onModeChange: (mode: 'builder' | 'dsl') => void
  operationId: string
  onOperationChange: (id: OperationId) => void
  index: string | null
  connectionId: string | null
  dslText: string
  docId: string
  needsDocId: boolean
  onDocIdChange: (docId: string) => void
  readOnly: boolean
  onRun: () => void
  running: boolean
  canRun: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [copiedCurl, setCopiedCurl] = useState(false)
  const [copiedDsl, setCopiedDsl] = useState(false)
  const operation = getOperation(operationId)
  const path = operation ? buildPath(operation, { index, docId: docId.trim() || '…' }) : '/'

  const copyCurl = async (): Promise<void> => {
    if (!connectionId) return
    try {
      const command = await window.api.es.curl({ connectionId, operationId, index, dslText })
      const copiedOk = await copyText(command)
      setCopiedCurl(copiedOk)
      if (copiedOk) window.setTimeout(() => setCopiedCurl(false), 1500)
    } catch {
      setCopiedCurl(false)
    }
  }

  const copyDsl = async (): Promise<void> => {
    const copiedOk = await copyText(dslText)
    setCopiedDsl(copiedOk)
    if (copiedOk) window.setTimeout(() => setCopiedDsl(false), 1500)
  }

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-2">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={mode}
        onValueChange={(next) => next && onModeChange(next === 'dsl' ? 'dsl' : 'builder')}
      >
        <ToggleGroupItem value="builder" className={cn('px-2.5 text-xs', toggleActiveClass)}>
          构建器
        </ToggleGroupItem>
        <ToggleGroupItem value="dsl" className={cn('px-2.5 text-xs', toggleActiveClass)}>
          DSL
        </ToggleGroupItem>
      </ToggleGroup>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-48 justify-between gap-1.5 font-normal">
            <span className="min-w-0 flex-1 truncate text-left">{operation?.label ?? '选择操作'}</span>
            <Badge variant="secondary" className="h-5 rounded px-1 text-xs font-normal">
              {operation?.method ?? 'GET'}
            </Badge>
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <Command>
            <CommandInput placeholder="搜索操作..." />
            <CommandList className="max-h-80">
              {OPERATION_GROUPS.map((group) => {
                const items = listOperations().filter((entry) => entry.group === group)
                if (items.length === 0) return null
                return (
                  <div key={group} className="py-1">
                    <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{group}</p>
                    {items.map((entry) => {
                      const disabled = entry.write && readOnly
                      const selected = entry.id === operationId
                      return (
                        <CommandItem
                          key={entry.id}
                          value={`${entry.label} ${entry.method}`}
                          disabled={disabled}
                          onSelect={() => {
                            onOperationChange(entry.id)
                            setOpen(false)
                          }}
                          className="gap-2"
                        >
                          <span className="min-w-0 flex-1 truncate text-xs">{entry.label}</span>
                          {disabled ? (
                            <span className="text-xs text-muted-foreground">只读</span>
                          ) : null}
                          {selected ? <Check className="size-3.5" /> : null}
                          <Badge
                            variant={entry.method === 'DELETE' ? 'destructive' : 'secondary'}
                            className="h-5 rounded px-1 text-xs font-normal"
                          >
                            {entry.method}
                          </Badge>
                        </CommandItem>
                      )
                    })}
                  </div>
                )
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {needsDocId ? (
        <Input
          value={docId}
          onChange={(event) => onDocIdChange(event.target.value)}
          placeholder="文档 _id"
          aria-label="文档 ID"
          aria-invalid={!docId.trim() || undefined}
          className="h-8 w-36 text-xs"
        />
      ) : null}

      <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-muted/30 px-2">
        <span className="truncate text-xs">
          {path.split('/').map((segment, position) => (
            <span key={`${segment}-${position}`} className={segment.startsWith('_') ? 'text-blue-600 dark:text-blue-400' : undefined}>
              {position > 0 ? '/' : ''}
              {segment}
            </span>
          ))}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {readOnly ? '只读 · 自动生成' : '索引 + 操作自动生成'}
        </span>
      </div>

      <Button size="sm" onClick={() => onRun()} disabled={!canRun || running} className="gap-1.5 active:scale-[0.98]">
        {running ? (
          <RotateCw className="size-3.5 animate-spin" />
        ) : (
          <Play className="size-3.5" />
        )}
        {running ? '运行中' : '运行'}
        <Kbd className="ml-0.5 bg-primary-foreground/15 text-primary-foreground/80">Ctrl ↵</Kbd>
      </Button>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="复制成 curl"
            onClick={() => void copyCurl()}
            disabled={!connectionId}
          >
            {copiedCurl ? (
              <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Terminal className="size-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>复制成 curl</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="复制 DSL"
            onClick={() => void copyDsl()}
            disabled={!operation}
          >
            {copiedDsl ? (
              <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{copiedDsl ? '已复制' : '复制 DSL'}</TooltipContent>
      </Tooltip>
    </div>
  )
}
