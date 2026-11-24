import { Monitor, Moon, Sun } from 'lucide-react'
import { formatBytes } from '@shared/format'
import type { ThemePreference } from '@/lib/theme'
import { cn, toggleActiveClass } from '@/lib/utils'
import { useAppInfo } from '@/lib/hooks/use-app-info'
import { useMetrics } from '@/lib/hooks/use-metrics'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useUiStore } from '@/stores/ui-store'

const SHORTCUTS: Array<[string, string]> = [
  ['Ctrl K', '命令面板：索引、连接、字段、历史'],
  ['Ctrl Enter', '运行当前查询'],
  ['Ctrl N', '新建连接'],
  ['Ctrl S', '保存当前查询'],
  ['F5', '刷新索引、mapping 与诊断数据']
]

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor }
]

export function SettingsDialog(): React.JSX.Element {
  const open = useUiStore((state) => state.settingsOpen)
  const close = useUiStore((state) => state.closeSettings)
  const theme = useUiStore((state) => state.theme)
  const setTheme = useUiStore((state) => state.setTheme)
  const { data: info } = useAppInfo()
  const metrics = useMetrics()

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>
            当前版本只提供只读信息与主题切换，更多选项后续补充。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <section className="grid gap-2">
            <h3 className="text-sm font-medium">关于</h3>
            <dl className="grid grid-cols-[6rem_1fr] items-center gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-muted-foreground">应用版本</dt>
              <dd className="tabular-nums">{info?.version ?? '-'}</dd>
              <dt className="text-muted-foreground">平台</dt>
              <dd>{info?.platform ?? '-'}</dd>
              <dt className="text-muted-foreground">语言</dt>
              <dd>{info?.locale ?? '-'}</dd>
              <dt className="text-muted-foreground">时区</dt>
              <dd>{info?.timezone ?? '-'}</dd>
              <dt className="text-muted-foreground">内存占用</dt>
              <dd className="tabular-nums">{metrics ? formatBytes(metrics.rssBytes) : '-'}</dd>
            </dl>
          </section>

          <Separator />

          <section className="grid gap-2">
            <h3 className="text-sm font-medium">主题</h3>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={theme}
              onValueChange={(value) => {
                if (value) setTheme(value as ThemePreference)
              }}
              className="w-fit"
            >
              {THEME_OPTIONS.map((option) => {
                const Icon = option.icon
                return (
                  <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    className={cn('gap-1.5 px-2.5 text-xs', toggleActiveClass)}
                  >
                    <Icon className="size-3.5" />
                    {option.label}
                  </ToggleGroupItem>
                )
              })}
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">
              选择跟随系统时会自动响应操作系统外观，切换过程带从点击位置扩散的过渡。
            </p>
          </section>

          <Separator />

          <section className="grid gap-2">
            <h3 className="text-sm font-medium">快捷键</h3>
            <div className="divide-y divide-border rounded-md border border-border">
              {SHORTCUTS.map(([key, description]) => (
                <div key={key} className="flex items-center gap-3 px-2 py-1.5 text-xs">
                  <Kbd className="w-24 shrink-0 justify-start px-1.5">{key}</Kbd>
                  <span className="text-muted-foreground">{description}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
