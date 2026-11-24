import { useState } from 'react'
import { X } from 'lucide-react'
import type { ConditionValue } from '@shared/types'
import { fieldTypeGroup, type OperatorDef, type ValueKind } from '@shared/query/operators'
import { cn, toggleActiveClass } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

export function initialValueFor(operator: OperatorDef): ConditionValue {
  switch (operator.valueKind) {
    case 'none':
      return { kind: 'none' }
    case 'multi':
      return { kind: 'list', values: [] }
    case 'range':
      return { kind: 'range', from: null, to: null }
    case 'datePills':
      return { kind: 'relative', amount: 7, unit: 'd' }
    default:
      return { kind: 'scalar', value: '' }
  }
}

const DATE_PRESETS: Array<{ amount: number; unit: 'h' | 'd'; label: string }> = [
  { amount: 1, unit: 'h', label: '1 小时' },
  { amount: 24, unit: 'h', label: '24 小时' },
  { amount: 7, unit: 'd', label: '7 天' },
  { amount: 30, unit: 'd', label: '30 天' }
]

const VALUE_TEXT_COLOR: Record<string, string> = {
  number: 'text-amber-600 dark:text-amber-400',
  text: 'text-emerald-600 dark:text-emerald-400',
  date: 'text-violet-600 dark:text-violet-400',
  keyword: 'text-emerald-600 dark:text-emerald-400'
}

function Hint({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-8 items-center rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground">
      {children}
    </div>
  )
}

export function ValueEditor({
  valueKind,
  fieldType,
  value,
  onChange,
  invalid
}: {
  valueKind: ValueKind
  fieldType: string
  value: ConditionValue | null
  onChange: (value: ConditionValue) => void
  invalid?: boolean
}): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const group = fieldTypeGroup(fieldType)

  if (valueKind === 'none' || valueKind === 'boolean') {
    return <Hint>该操作符无需填值</Hint>
  }

  if (valueKind === 'multi') {
    const values = value?.kind === 'list' ? value.values : []
    const remove = (index: number): void =>
      onChange({ kind: 'list', values: values.filter((_, position) => position !== index) })
    const add = (): void => {
      const trimmed = draft.trim()
      if (!trimmed) return
      onChange({ kind: 'list', values: [...values, trimmed] })
      setDraft('')
    }
    return (
      <div
        className={cn(
          'flex min-h-8 flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-1.5 py-1 transition-colors focus-within:border-ring',
          invalid && 'border-destructive'
        )}
      >
        {values.map((item, index) => (
          <Badge
            key={`${item}-${index}`}
            variant="secondary"
            className="h-6 gap-1 rounded-sm px-1.5 text-xs font-normal"
          >
            {item}
            <button
              type="button"
              onClick={() => remove(index)}
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label={`删除 ${item}`}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add()
            }
          }}
          placeholder={values.length === 0 ? '输入后回车添加' : '+ 添加'}
          className="h-6 min-w-24 flex-1 bg-transparent px-1 text-xs outline-none placeholder:text-muted-foreground"
        />
      </div>
    )
  }

  if (valueKind === 'range') {
    const range = value?.kind === 'range' ? value : { from: null, to: null }
    return (
      <div className="flex items-center gap-1.5">
        <Input
          value={range.from ?? ''}
          onChange={(event) => onChange({ kind: 'range', from: event.target.value, to: range.to })}
          placeholder="起"
          aria-invalid={invalid || undefined}
          className="h-8 w-28 px-2 text-xs"
        />
        <span className="text-xs text-muted-foreground">~</span>
        <Input
          value={range.to ?? ''}
          onChange={(event) => onChange({ kind: 'range', from: range.from, to: event.target.value })}
          placeholder="止"
          aria-invalid={invalid || undefined}
          className="h-8 w-28 px-2 text-xs"
        />
        <span className="shrink-0 text-xs text-muted-foreground">含端点</span>
      </div>
    )
  }

  if (valueKind === 'datePills') {
    const relative = value?.kind === 'relative' ? value : { amount: 7, unit: 'd' as const }
    const active = `${relative.amount}${relative.unit}`
    return (
      <div className="flex items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={active}
          onValueChange={(next) => {
            const preset = DATE_PRESETS.find((entry) => `${entry.amount}${entry.unit}` === next)
            if (preset) onChange({ kind: 'relative', amount: preset.amount, unit: preset.unit })
          }}
        >
          {DATE_PRESETS.map((preset) => (
            <ToggleGroupItem
              key={preset.label}
              value={`${preset.amount}${preset.unit}`}
              className={cn('h-8 px-2 text-xs', toggleActiveClass)}
            >
              {preset.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="shrink-0 text-xs text-muted-foreground">
          now-{relative.amount}
          {relative.unit}
        </span>
      </div>
    )
  }

  const scalar = value?.kind === 'scalar' ? String(value.value) : ''
  return (
    <div className="flex items-center gap-2">
      <Input
        value={scalar}
        onChange={(event) => onChange({ kind: 'scalar', value: event.target.value })}
        aria-invalid={invalid || undefined}
        placeholder={group === 'number' ? '输入数值' : '输入值'}
        className={cn('h-8 px-2 text-xs', VALUE_TEXT_COLOR[group])}
      />
      {group === 'number' ? (
        <span className="shrink-0 text-xs text-muted-foreground">数值</span>
      ) : null}
    </div>
  )
}
