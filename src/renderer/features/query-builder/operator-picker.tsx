import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { OperatorDef } from '@shared/query/operators'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export function OperatorPicker({
  operators,
  value,
  onChange,
  disabled
}: {
  operators: OperatorDef[]
  value: string | null
  onChange: (operator: OperatorDef) => void
  disabled?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const selected = operators.find((operator) => operator.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-8 w-full justify-between gap-1.5 px-2 text-xs font-normal"
        >
          <span className={selected ? 'min-w-0 flex-1 truncate text-left' : 'min-w-0 flex-1 truncate text-left text-muted-foreground'}>
            {selected?.label ?? '先选字段'}
          </span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <Command>
          <CommandInput placeholder="搜索操作符" />
          <CommandList>
            <CommandEmpty>没有匹配的操作符</CommandEmpty>
            {operators.map((operator) => (
              <CommandItem
                key={operator.id}
                value={`${operator.label} ${operator.keyword}`}
                onSelect={() => {
                  onChange(operator)
                  setOpen(false)
                }}
                className="gap-2"
              >
                <span className="flex-1 text-xs">{operator.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {operator.keyword}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
