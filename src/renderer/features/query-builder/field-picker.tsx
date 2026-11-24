import { useMemo, useState } from 'react'
import { ChevronsUpDown, Info } from 'lucide-react'
import type { FieldSchema } from '@shared/types'
import { fieldTypeGroup } from '@shared/query/operators'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TypeBadge } from '@/components/common/type-badge'

export function flattenFields(fields: FieldSchema[]): FieldSchema[] {
  const flat: FieldSchema[] = []
  const visit = (list: FieldSchema[]): void => {
    for (const field of list) {
      flat.push(field)
      if (field.children) visit(field.children)
    }
  }
  visit(fields)
  return flat
}

export function FieldPicker({
  fields,
  value,
  onChange,
  disabled
}: {
  fields: FieldSchema[]
  value: string | null
  onChange: (field: FieldSchema) => void
  disabled?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const flat = useMemo(() => flattenFields(fields).filter((field) => !field.children), [fields])
  const selected = value ? flat.find((field) => field.path === value) ?? null : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            'h-8 w-full justify-between gap-1.5 px-2 text-xs font-normal',
            !selected && 'text-muted-foreground'
          )}
        >
          <span className="min-w-0 flex-1 truncate text-left">{selected?.path ?? '选择字段'}</span>
          {selected ? <TypeBadge type={selected.type} /> : null}
          <ChevronsUpDown className="size-3 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder={`搜索 ${flat.length} 个字段`} />
          <CommandList className="max-h-72">
            <CommandEmpty>没有匹配的字段</CommandEmpty>
            {flat.map((field) => (
              <CommandItem
                key={field.path}
                value={field.path}
                onSelect={() => {
                  onChange(field)
                  setOpen(false)
                }}
                className="gap-2"
              >
                <span className="min-w-0 flex-1 truncate text-xs">{field.path}</span>
                {fieldTypeGroup(field.type) === 'text' ? (
                  <span className="shrink-0 text-xs text-muted-foreground">不可聚合</span>
                ) : null}
                <TypeBadge type={field.type} />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
        <div className="flex items-center gap-1.5 border-t border-border px-2.5 py-1.5 text-xs text-muted-foreground">
          <Info className="size-3 shrink-0" />
          <span>text 字段聚合需改用 .keyword</span>
        </div>
      </PopoverContent>
    </Popover>
  )
}
