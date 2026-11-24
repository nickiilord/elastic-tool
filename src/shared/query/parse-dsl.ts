import type { ConditionValue, QueryCondition, QueryGroup, QueryTree } from '../types'
import { createId } from '../id'

/**
 * 把 DSL 文本解析回条件树。只支持能无损映射的子集：
 * term、terms、range、exists、match、match_phrase、prefix、wildcard，
 * 以及一层 bool 组合（must / should / must_not）。
 * 任何无法映射的结构返回 null，调用方应保留原文并提示用户。
 */
export function parseDsl(text: string): QueryTree | null {
  let doc: unknown
  try {
    doc = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(doc)) return null

  const query = doc.query
  if (!isRecord(query)) {
    return emptyTree()
  }
  const rawBool = query.bool
  if (!isRecord(rawBool)) return null

  const bool = rawBool
  const rootChildren: Array<QueryCondition | QueryGroup> = []
  let logic: 'all' | 'any' = 'all'

  const must = asArray(bool.must)
  const should = asArray(bool.should)
  const mustNot = asArray(bool.must_not)

  if (must.length > 0) {
    logic = 'all'
    const parsed = parseClauseList(must, 0)
    if (!parsed) return null
    rootChildren.push(...parsed)
  }
  if (should.length > 0) {
    if (must.length > 0) {
      // 同时有 must 和 should 时无法映射成一层组，放弃。
      return null
    }
    logic = 'any'
    const parsed = parseClauseList(should, 0)
    if (!parsed) return null
    rootChildren.push(...parsed)
  }

  const exclusionChildren: QueryCondition[] = []
  for (const item of mustNot) {
    if (!isRecord(item)) return null
    const parsed = parseClause(item)
    if (!parsed) return null
    exclusionChildren.push(parsed)
  }

  if (rootChildren.length === 0 && exclusionChildren.length === 0) {
    return emptyTree()
  }

  return {
    root: { kind: 'group', id: createId('g'), logic, children: rootChildren },
    exclusion: { kind: 'exclusion', id: createId('x'), children: exclusionChildren }
  }
}

function emptyTree(): QueryTree {
  return {
    root: { kind: 'group', id: createId('g'), logic: 'all', children: [] },
    exclusion: { kind: 'exclusion', id: createId('x'), children: [] }
  }
}

function parseClauseList(
  items: unknown[],
  depth: number
): Array<QueryCondition | QueryGroup> | null {
  const out: Array<QueryCondition | QueryGroup> = []
  for (const item of items) {
    if (!isRecord(item)) return null

    if (isRecord(item.bool)) {
      if (depth >= 1) return null
      const nested = parseNestedBool(item.bool, depth + 1)
      if (!nested) return null
      out.push(nested)
      continue
    }

    const parsed = parseClause(item)
    if (!parsed) return null
    out.push(parsed)
  }
  return out
}

function parseNestedBool(bool: Record<string, unknown>, depth: number): QueryGroup | null {
  const must = asArray(bool.must)
  const should = asArray(bool.should)
  const mustNot = asArray(bool.must_not)
  if (mustNot.length > 0) return null
  if (must.length > 0 && should.length > 0) return null

  const logic: 'all' | 'any' = should.length > 0 ? 'any' : 'all'
  const items = should.length > 0 ? should : must
  if (items.length === 0) return null

  const children: Array<QueryCondition | QueryGroup> = []
  for (const item of items) {
    if (!isRecord(item)) return null
    if (isRecord(item.bool)) {
      if (depth >= 1) return null
      const nested = parseNestedBool(item.bool, depth + 1)
      if (!nested) return null
      children.push(nested)
      continue
    }
    const parsed = parseClause(item)
    if (!parsed) return null
    children.push(parsed)
  }

  return { kind: 'group', id: createId('g'), logic, children }
}

function parseClause(clause: Record<string, unknown>): QueryCondition | null {
  const keys = Object.keys(clause)
  if (keys.length !== 1) return null
  const kind = keys[0]
  const body = clause[kind]
  if (!isRecord(body)) return null

  const field = Object.keys(body)[0]
  if (!field) return null
  const raw = body[field]

  switch (kind) {
    case 'term': {
      const value = isRecord(raw) ? raw.value : raw
      const scalar = toScalar(value)
      if (scalar === null) return null
      return condition(field, 'eq', { kind: 'scalar', value: scalar })
    }
    case 'terms': {
      if (!Array.isArray(raw)) return null
      const values = raw.filter((item) => typeof item === 'string' || typeof item === 'number')
      if (values.length === 0) return null
      return condition(field, 'any', { kind: 'list', values: values.map(String) })
    }
    case 'exists':
      if (raw !== undefined && raw !== null) return condition(field, 'exists', { kind: 'none' })
      return condition(field, 'exists', { kind: 'none' })
    case 'match':
    case 'match_phrase':
    case 'prefix':
    case 'wildcard': {
      const value = isRecord(raw) ? raw.value ?? raw.query : raw
      if (typeof value !== 'string' && typeof value !== 'number') return null
      const op = kind === 'match_phrase' ? 'match_phrase' : kind
      return condition(field, op, { kind: 'scalar', value: String(value) })
    }
    case 'range': {
      if (!isRecord(raw)) return null
      const gte = toScalar(raw.gte)
      const gt = toScalar(raw.gt)
      const lte = toScalar(raw.lte)
      const lt = toScalar(raw.lt)
      const relative = typeof raw.gte === 'string' ? parseRelative(raw.gte) : null
      if (relative) return condition(field, 'recent', { kind: 'relative', ...relative })
      if (gte !== null && lte !== null) {
        return condition(field, 'between', { kind: 'range', from: String(gte), to: String(lte) })
      }
      if (gte !== null) return condition(field, 'gte', { kind: 'scalar', value: gte })
      if (gt !== null) return condition(field, 'gt', { kind: 'scalar', value: gt })
      if (lte !== null) return condition(field, 'lte', { kind: 'scalar', value: lte })
      if (lt !== null) return condition(field, 'lt', { kind: 'scalar', value: lt })
      return null
    }
    default:
      return null
  }
}

function parseRelative(raw: string): { unit: 'h' | 'd'; amount: number } | null {
  const match = /^now-(\d+)([hd])$/.exec(raw)
  if (!match) return null
  return { amount: Number(match[1]), unit: match[2] as 'h' | 'd' }
}

function condition(field: string, operator: string, value: ConditionValue): QueryCondition {
  return { kind: 'condition', id: createId('c'), field, operator, value }
}

function toScalar(raw: unknown): string | number | boolean | null {
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return raw
  return null
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value === undefined || value === null) return []
  return [value]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
