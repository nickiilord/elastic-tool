import type {
  CompileResult,
  CompileSummary,
  ConditionValue,
  QueryCondition,
  QueryGroup,
  QueryTree
} from '../types'
import { fieldTypeGroup, getOperator, type OperatorDef } from './operators'

export interface FieldMeta {
  type: string
  aggregatable: boolean
  keywordSubfield?: string
}

export interface CompileContext {
  fields: Map<string, FieldMeta>
  size: number
  trackTotalHits: boolean
  sort: { field: string; order: 'asc' | 'desc' } | null
  /** 分页偏移，第一页为 0 时省略，让 DSL 保持简洁。 */
  from?: number
}

interface CompiledGroup {
  queries: Record<string, unknown>[]
  logic: 'all' | 'any'
  summaries: CompileSummary[]
  incomplete: number
}

function scalarOf(value: ConditionValue | null): string | null {
  if (!value) return null
  if (value.kind === 'scalar') {
    const text = String(value.value)
    return text === '' ? null : text
  }
  return null
}

function listOf(value: ConditionValue | null): string[] {
  if (!value) return []
  if (value.kind === 'list') return value.values.filter((item) => item !== '')
  if (value.kind === 'scalar') return [String(value.value)].filter((item) => item !== '')
  return []
}

function rangeOf(value: ConditionValue | null): { from: string | null; to: string | null } {
  if (!value || value.kind !== 'range') return { from: null, to: null }
  return { from: value.from, to: value.to }
}

function relativeOf(value: ConditionValue | null): { unit: 'h' | 'd'; amount: number } | null {
  if (!value || value.kind !== 'relative') return null
  return { unit: value.unit, amount: value.amount }
}

function toNumber(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function termValue(fieldType: string, raw: string): string | number {
  if (fieldTypeGroup(fieldType) === 'number') {
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : raw
  }
  return raw
}

function buildConditionQuery(
  condition: QueryCondition,
  op: OperatorDef,
  fieldType: string
): Record<string, unknown> | null {
  const field = condition.field as string
  const value = condition.value
  const group = fieldTypeGroup(fieldType)

  switch (op.semantic) {
    case 'eq': {
      const raw = scalarOf(value)
      if (raw === null) return null
      return { term: { [field]: termValue(fieldType, raw) } }
    }
    case 'ne': {
      const raw = scalarOf(value)
      if (raw === null) return null
      return { bool: { must_not: [{ term: { [field]: termValue(fieldType, raw) } }] } }
    }
    case 'any': {
      const values = listOf(value)
      if (values.length === 0) return null
      return { terms: { [field]: values.map((item) => termValue(fieldType, item)) } }
    }
    case 'all': {
      const values = listOf(value)
      if (values.length === 0) return null
      return {
        bool: { must: values.map((item) => ({ term: { [field]: termValue(fieldType, item) } })) }
      }
    }
    case 'exists':
      return { exists: { field } }
    case 'missing':
      return { bool: { must_not: [{ exists: { field } }] } }
    case 'prefix': {
      const raw = scalarOf(value)
      if (raw === null) return null
      return { prefix: { [field]: raw } }
    }
    case 'wildcard': {
      const raw = scalarOf(value)
      if (raw === null) return null
      return { wildcard: { [field]: raw } }
    }
    case 'match': {
      const raw = scalarOf(value)
      if (raw === null) return null
      return { match: { [field]: raw } }
    }
    case 'match_phrase': {
      const raw = scalarOf(value)
      if (raw === null) return null
      return { match_phrase: { [field]: raw } }
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const raw = scalarOf(value)
      if (raw === null) return null
      const bound = group === 'number' ? toNumber(raw) : raw
      if (bound === null) return null
      return { range: { [field]: { [op.semantic]: bound } } }
    }
    case 'between': {
      const { from, to } = rangeOf(value)
      if (from === null && to === null) return null
      const range: Record<string, unknown> = {}
      if (from !== null && from !== '') {
        range.gte = group === 'number' ? toNumber(from) : from
      }
      if (to !== null && to !== '') {
        range.lte = group === 'number' ? toNumber(to) : to
      }
      return { range: { [field]: range } }
    }
    case 'recent': {
      const relative = relativeOf(value)
      if (!relative) return null
      return { range: { [field]: { gte: `now-${relative.amount}${relative.unit}` } } }
    }
    case 'after': {
      const raw = scalarOf(value)
      if (raw === null) return null
      return { range: { [field]: { gte: raw } } }
    }
    case 'before': {
      const raw = scalarOf(value)
      if (raw === null) return null
      return { range: { [field]: { lt: raw } } }
    }
    case 'is_true':
      return { term: { [field]: true } }
    case 'is_false':
      return { term: { [field]: false } }
    case 'cidr': {
      const raw = scalarOf(value)
      if (raw === null) return null
      return { term: { [field]: raw } }
    }
    case 'geo_distance': {
      const raw = scalarOf(value)
      if (raw === null) return null
      const [lat, lon, distance] = raw.split(',').map((part) => part.trim())
      if (!lat || !lon) return null
      return {
        geo_distance: {
          distance: distance || '1km',
          [field]: { lat: Number(lat), lon: Number(lon) }
        }
      }
    }
    default:
      return null
  }
}

function summarize(
  condition: QueryCondition,
  op: OperatorDef,
  fieldType: string
): CompileSummary | null {
  const field = condition.field
  if (!field) return null
  const value = condition.value
  const raw = scalarOf(value)
  const list = listOf(value)
  const range = rangeOf(value)
  const relative = relativeOf(value)
  const group = fieldTypeGroup(fieldType)

  const text = (() => {
    switch (op.semantic) {
      case 'eq':
      case 'ne':
      case 'prefix':
      case 'wildcard':
      case 'match':
      case 'match_phrase':
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
      case 'after':
      case 'before':
      case 'cidr':
        return raw ? `${op.label} ${raw}` : op.label
      case 'any':
      case 'all':
        return list.length > 0 ? `${op.label} ${list.join(', ')}` : op.label
      case 'between':
        return `区间 ${range.from ?? '不限'} 至 ${range.to ?? '不限'}`
      case 'recent':
        return relative
          ? `最近 ${relative.amount} ${relative.unit === 'h' ? '小时' : '天'}`
          : '最近'
      case 'exists':
      case 'missing':
      case 'is_true':
      case 'is_false':
        return op.label
      case 'geo_distance':
        return raw ? `距离 ${raw} 内` : '距离范围'
      default:
        return op.label
    }
  })()

  const meta = (() => {
    switch (op.semantic) {
      case 'eq':
        return 'term'
      case 'ne':
        return 'must_not term'
      case 'any':
        return 'terms'
      case 'all':
        return 'bool.must'
      case 'exists':
      case 'missing':
        return 'exists'
      case 'match':
        return 'match'
      case 'match_phrase':
        return 'match_phrase'
      case 'between':
        return 'range · gte · lte'
      case 'recent':
        return relative ? `range · gte now-${relative.amount}${relative.unit}` : 'range'
      case 'after':
        return 'range · gte'
      case 'before':
        return 'range · lt'
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
        return `range · ${op.semantic}`
      default:
        return op.keyword
    }
  })()

  const numeric = group === 'number' ? '' : ''
  return { conditionId: condition.id, field, text, meta }
}

function compileCondition(
  condition: QueryCondition,
  ctx: CompileContext
): { query: Record<string, unknown> | null; summary: CompileSummary | null; incomplete: boolean } {
  if (!condition.field || !condition.operator) {
    return { query: null, summary: null, incomplete: true }
  }
  const op = getOperator(condition.operator)
  if (!op) return { query: null, summary: null, incomplete: true }

  const meta = ctx.fields.get(condition.field)
  const fieldType = meta?.type ?? 'unknown'
  const query = buildConditionQuery(condition, op, fieldType)
  if (query === null) {
    return { query: null, summary: null, incomplete: true }
  }
  return { query, summary: summarize(condition, op, fieldType), incomplete: false }
}

function compileGroup(group: QueryGroup, ctx: CompileContext): CompiledGroup {
  const queries: Record<string, unknown>[] = []
  const summaries: CompileSummary[] = []
  let incomplete = 0

  for (const child of group.children) {
    if (child.kind === 'condition') {
      const built = compileCondition(child, ctx)
      if (built.incomplete) {
        incomplete += 1
        continue
      }
      if (built.query) queries.push(built.query)
      if (built.summary) summaries.push(built.summary)
      continue
    }

    const nested = compileGroup(child, ctx)
    incomplete += nested.incomplete
    summaries.push(...nested.summaries)
    if (nested.queries.length > 0) {
      queries.push(
        child.logic === 'all'
          ? { bool: { must: nested.queries } }
          : { bool: { should: nested.queries, minimum_should_match: 1 } }
      )
    }
  }

  return { queries, logic: group.logic, summaries, incomplete }
}

export function compileQuery(tree: QueryTree, ctx: CompileContext): CompileResult {
  const root = compileGroup(tree.root, ctx)
  const exclusionQueries: Record<string, unknown>[] = []
  const exclusionSummaries: CompileSummary[] = []
  let incomplete = root.incomplete

  for (const condition of tree.exclusion.children) {
    const built = compileCondition(condition, ctx)
    if (built.incomplete) {
      incomplete += 1
      continue
    }
    if (built.query) exclusionQueries.push(built.query)
    if (built.summary) exclusionSummaries.push(built.summary)
  }

  const bool: Record<string, unknown> = {}
  if (root.logic === 'all') {
    if (root.queries.length > 0) bool.must = root.queries
  } else if (root.queries.length > 0) {
    bool.should = root.queries
    bool.minimum_should_match = 1
  }
  if (exclusionQueries.length > 0) bool.must_not = exclusionQueries

  const dsl: Record<string, unknown> = {}
  if (ctx.from && ctx.from > 0) dsl.from = ctx.from
  if (ctx.size > 0) dsl.size = ctx.size
  if (ctx.trackTotalHits) dsl.track_total_hits = true
  if (ctx.sort) dsl.sort = [{ [ctx.sort.field]: ctx.sort.order }]
  if (Object.keys(bool).length > 0) dsl.query = { bool }

  return {
    dsl,
    summaries: [...root.summaries, ...exclusionSummaries],
    conditionsCount: root.summaries.length + exclusionSummaries.length + incomplete,
    incompleteCount: incomplete
  }
}

export function stringifyDsl(dsl: Record<string, unknown> | null): string {
  return dsl ? JSON.stringify(dsl, null, 2) : '{}'
}
