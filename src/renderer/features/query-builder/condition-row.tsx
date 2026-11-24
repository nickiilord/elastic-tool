import { Copy, Trash2 } from 'lucide-react'
import type { FieldSchema, QueryCondition } from '@shared/types'
import { defaultOperatorForField, getOperator } from '@shared/query/operators'
import { operatorsForField } from '@shared/query/operators'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FieldPicker } from './field-picker'
import { OperatorPicker } from './operator-picker'
import { initialValueFor, ValueEditor } from './value-editor'

export function ConditionRow({
  condition,
  fields,
  invalid,
  onChange,
  onRemove,
  onDuplicate
}: {
  condition: QueryCondition
  fields: FieldSchema[]
  invalid?: boolean
  onChange: (patch: Partial<QueryCondition>) => void
  onRemove: () => void
  onDuplicate: () => void
}): React.JSX.Element {
  const field = condition.field
    ? fields.find((entry) => entry.path === condition.field) ?? null
    : null
  const operator = getOperator(condition.operator)
  const operators = field ? operatorsForField(field.type) : []
  const incomplete = !field || !operator

  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors',
        invalid
          ? 'border-destructive/40 bg-destructive/5'
          : incomplete
            ? 'border-dashed border-border bg-muted/20'
            : 'border-border bg-card hover:border-ring/30 hover:bg-accent/20'
      )}
    >
      <div className="w-56 shrink-0">
        <FieldPicker
          fields={fields}
          value={condition.field}
          onChange={(nextField) => {
            const nextOperator = defaultOperatorForField(nextField.type)
            onChange({
              field: nextField.path,
              operator: nextOperator?.id ?? 'eq',
              value: nextOperator ? initialValueFor(nextOperator) : { kind: 'scalar', value: '' }
            })
          }}
        />
      </div>

      <div className="w-32 shrink-0">
        <OperatorPicker
          operators={operators}
          value={condition.operator}
          disabled={!field}
          onChange={(nextOperator) => {
            onChange({ operator: nextOperator.id, value: initialValueFor(nextOperator) })
          }}
        />
      </div>

      <div className="min-w-0 flex-1">
        {operator ? (
          <ValueEditor
            valueKind={operator.valueKind}
            fieldType={field?.type ?? 'unknown'}
            value={condition.value}
            invalid={invalid}
            onChange={(value) => onChange({ value })}
          />
        ) : (
          <div className="flex h-8 items-center rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground">
            {field ? '这个字段没有可用操作符' : '先选字段，再选操作符'}
          </div>
        )}
      </div>

      <div
        className={cn(
          'flex w-13 shrink-0 items-center justify-end gap-0.5 transition-opacity',
          invalid || incomplete ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              aria-label="复制条件"
              onClick={onDuplicate}
            >
              <Copy className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>复制条件</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-destructive"
              aria-label="删除条件"
              onClick={onRemove}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>删除条件</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
