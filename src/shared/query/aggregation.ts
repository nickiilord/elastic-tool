import type { FieldSchema } from '../types'
import { fieldTypeGroup } from './operators'

function flatten(fields: FieldSchema[]): FieldSchema[] {
  const out: FieldSchema[] = []
  const visit = (list: FieldSchema[]): void => {
    for (const field of list) {
      out.push(field)
      if (field.children) visit(field.children)
    }
  }
  visit(fields)
  return out
}

export function pickAggregationField(
  fields: FieldSchema[],
  preferred?: string | null
): FieldSchema | null {
  const flat = flatten(fields).filter((field) => !field.children && field.aggregatable)
  if (preferred) {
    const found = flat.find((field) => field.path === preferred)
    if (found) return found
  }
  return (
    flat.find((field) => ['keyword', 'date', 'number'].includes(fieldTypeGroup(field.type))) ??
    null
  )
}

export function aggregationName(field: FieldSchema): string {
  return `by_${field.path.replace(/[^a-zA-Z0-9]+/g, '_')}`
}

export function buildTermsAggregation(field: FieldSchema, size = 10): Record<string, unknown> {
  return { terms: { field: field.path, size } }
}

export function buildAggregations(
  field: FieldSchema | null
): Record<string, unknown> | null {
  if (!field) return null
  return { [aggregationName(field)]: buildTermsAggregation(field) }
}
