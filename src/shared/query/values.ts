import type { ConditionValue, FieldSchema } from '../types'
import { defaultOperatorForField, fieldTypeGroup } from './operators'

export function defaultValueForField(type: string): ConditionValue {
  const group = fieldTypeGroup(type)
  if (group === 'date') return { kind: 'relative', amount: 7, unit: 'd' }
  if (group === 'boolean') return { kind: 'none' }
  return { kind: 'scalar', value: '' }
}

export function defaultConditionForField(field: FieldSchema): {
  operator: string
  value: ConditionValue
} {
  const operator = defaultOperatorForField(field.type)
  return {
    operator: operator?.id ?? 'eq',
    value: defaultValueForField(field.type)
  }
}
