import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  Minus,
  Moon,
  Plus,
  RefreshCw,
  Settings,
  Square,
  Sun,
  Trash2,
  X
} from 'lucide-react'
import type { ConnectionSummary } from '@shared/types'
import { cn, toggleActiveClass } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConnections } from '@/lib/hooks/use-connections'
import { useTheme } from '@/lib/hooks/use-theme'
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

function TrafficLights(): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 pl-1">
      <span className="size-3 rounded-full bg-[#ff5f57]" />
      <span className="size-3 rounded-full bg-[#febc2e]" />
      <span className="size-3 rounded-full bg-[#28c840]" />
    </div>
  )
}

function WindowControls(): React.JSX.Element | null {
  const isMac = /mac/i.test(navigator.userAgent)
  if (isMac) return null
  return (
    <div className="ml-1 flex items-center">
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-8 rounded-none"
        aria-label="最小化"
        onClick={() => void window.api.window.minimize()}
      >
        <Minus className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-8 rounded-none"
        aria-label="最大化"
        onClick={() => void window.api.window.toggleMaximize()}
      >
        <Square className="size-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-8 rounded-none hover:bg-destructive hover:text-white dark:hover:bg-destructive"
        aria-label="关闭"
        onClick={() => void window.api.window.close()}
      >
        <X className="size-4" />
      </Button>
    </div>
  )
}

export function TitleBar(): React.JSX.Element {
  const { data: connections = [] } = useConnections()
  const connectionId = useUiStore((state) => state.connectionId)
  const view = useUiStore((state) => state.view)
  const setConnection = useUiStore((state) => state.setConnection)
  const setView = useUiStore((state) => state.setView)
  const openConnectionDialog = useUiStore((state) => state.openConnectionDialog)
  const openSettings = useUiStore((state) => state.openSettings)
  const openDeleteConnection = useUiStore((state) => state.openDeleteConnection)
  const { resolved, toggle } = useTheme()
  const queryClient = useQueryClient()
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const isMac = /mac/i.test(navigator.userAgent)

  const active = useMemo(
    () => connections.find((connection) => connection.id === connectionId) ?? connections[0],
    [connections, connectionId]
  )

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['indices'] })
    void queryClient.invalidateQueries({ queryKey: ['schema'] })
    void queryClient.invalidateQueries({ queryKey: ['diagnostics'] })
  }

  return (
    <header className="flex h-13 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
      {isMac ? <TrafficLights /> : null}

      <div className="drag flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M2.6 9L6 3l3.4 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle cx="6" cy="7.2" r="0.9" fill="currentColor" />
          </svg>
        </span>
        <span className="text-sm font-medium tracking-tight">elastic-tool</span>
      </div>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 px-2 text-xs">
            <span
              className={cn(
                'size-2 rounded-full',
                active ? ENV_DOT[active.environment] : 'bg-muted-foreground/40'
              )}
            />
            <span className="max-w-40 truncate">{active?.name ?? '未连接'}</span>
            {active?.readOnly ? (
              <Badge variant="outline" className="h-5 rounded-md px-1.5 text-xs">
                只读
              </Badge>
            ) : null}
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-1">
          {connections.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">还没有连接</p>
          ) : (
            connections.map((connection) => (
              <div key={connection.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setConnection(connection.id)
                    setSwitcherOpen(false)
                  }}
                  className={cn(
                    'flex h-8 flex-1 items-center gap-2 rounded-md px-2 text-left text-xs transition-colors hover:bg-accent',
                    connection.id === connectionId && 'bg-accent text-accent-foreground'
                  )}
                >
                  <span className={cn('size-2 rounded-full', ENV_DOT[connection.environment])} />
                  <span className="flex-1 truncate">{connection.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {ENV_LABEL[connection.environment]}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                  aria-label="删除连接"
                  onClick={() => {
                    setSwitcherOpen(false)
                    openDeleteConnection(connection.id)
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))
          )}
          <Separator className="my-1" />
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => {
              setSwitcherOpen(false)
              openConnectionDialog()
            }}
          >
            <Plus className="size-4" />
            新建连接
          </Button>
        </PopoverContent>
      </Popover>

      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={view}
        onValueChange={(next) => next && setView(next === 'diagnostics' ? 'diagnostics' : 'query')}
        className="ml-1"
      >
        <ToggleGroupItem value="query" className={cn('px-2.5 text-xs', toggleActiveClass)}>
          查询
        </ToggleGroupItem>
        <ToggleGroupItem value="diagnostics" className={cn('px-2.5 text-xs', toggleActiveClass)}>
          诊断
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="drag min-w-4 flex-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="刷新（F5）" onClick={refresh}>
            <RefreshCw className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>刷新数据（F5）</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="切换主题"
            onClick={(event) => toggle(event)}
          >
            {resolved === 'dark' ? (
              <Sun className="size-4 animate-in fade-in-0 zoom-in-90 duration-200" />
            ) : (
              <Moon className="size-4 animate-in fade-in-0 zoom-in-90 duration-200" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{resolved === 'dark' ? '切换到浅色' : '切换到深色'}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="设置" onClick={openSettings}>
            <Settings className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>设置</TooltipContent>
      </Tooltip>

      <WindowControls />
    </header>
  )
}
