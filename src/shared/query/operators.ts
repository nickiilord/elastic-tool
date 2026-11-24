import type { FieldSchema } from '../types'

export type ValueKind = 'scalar' | 'multi' | 'number' | 'range' | 'datePills' | 'boolean' | 'none'

export type OperatorSemantic =
  | 'eq'
  | 'ne'
  | 'any'
  | 'all'
  | 'exists'
  | 'missing'
  | 'prefix'
  | 'wildcard'
  | 'match'
  | 'match_phrase'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'recent'
  | 'after'
  | 'before'
  | 'is_true'
  | 'is_false'
  | 'cidr'
  | 'geo_distance'

export type FieldTypeGroup =
  | 'keyword'
  | 'text'
  | 'number'
  | 'date'
  | 'boolean'
  | 'ip'
  | 'geo'
  | 'object'
  | 'unknown'

export interface OperatorDef {
  id: string
  label: string
  keyword: string
  valueKind: ValueKind
  semantic: OperatorSemantic
  default?: boolean
}

const OP = (
  id: string,
  label: string,
  keyword: string,
  valueKind: ValueKind,
  semantic: OperatorSemantic,
  options: { default?: boolean } = {}
): OperatorDef => ({ id, label, keyword, valueKind, semantic, ...options })

const EQUALS = OP('eq', '等于', 'term', 'scalar', 'eq', { default: true })
const NOT_EQUALS = OP('ne', '不等于', 'must_not term', 'scalar', 'ne')
const ANY_OF = OP('any', '包含任一', 'terms', 'multi', 'any')
const ALL_OF = OP('all', '包含全部', 'bool.must term', 'multi', 'all')
const EXISTS = OP('exists', '存在', 'exists', 'none', 'exists')
const MISSING = OP('missing', '不存在', 'must_not exists', 'none', 'missing')
const PREFIX = OP('prefix', '前缀', 'prefix', 'scalar', 'prefix')
const WILDCARD = OP('wildcard', '通配', 'wildcard', 'scalar', 'wildcard')

const MATCH = OP('match', '匹配', 'match', 'scalar', 'match', { default: true })
const MATCH_PHRASE = OP('match_phrase', '包含短语', 'match_phrase', 'scalar', 'match_phrase')

const GREATER = OP('gt', '大于', 'gt', 'number', 'gt')
const GREATER_EQUAL = OP('gte', '大于等于', 'gte', 'number', 'gte')
const LESS = OP('lt', '小于', 'lt', 'number', 'lt')
const LESS_EQUAL = OP('lte', '小于等于', 'lte', 'number', 'lte')
const BETWEEN_NUMBER = OP('between_number', '区间', 'range', 'range', 'between')

const RECENT = OP('recent', '最近', 'now-Nd', 'datePills', 'recent', { default: true })
const AFTER = OP('after', '之后', 'gte', 'scalar', 'after')
const BEFORE = OP('before', '之前', 'lt', 'scalar', 'before')
const BETWEEN_DATE = OP('between_date', '区间', 'gte · lte', 'range', 'between')

const IS_TRUE = OP('is_true', '是', 'term true', 'none', 'is_true', { default: true })
const IS_FALSE = OP('is_false', '否', 'term false', 'none', 'is_false')

const CIDR = OP('cidr', '网段', 'term', 'scalar', 'cidr')
const GEO_DISTANCE = OP('geo_distance', '距离范围', 'geo_distance', 'scalar', 'geo_distance', {
  default: true
})

const BY_ID = new Map<string, OperatorDef>()
for (const op of [
  EQUALS,
  NOT_EQUALS,
  ANY_OF,
  ALL_OF,
  EXISTS,
  MISSING,
  PREFIX,
  WILDCARD,
  MATCH,
  MATCH_PHRASE,
  GREATER,
  GREATER_EQUAL,
  LESS,
  LESS_EQUAL,
  BETWEEN_NUMBER,
  RECENT,
  AFTER,
  BEFORE,
  BETWEEN_DATE,
  IS_TRUE,
  IS_FALSE,
  CIDR,
  GEO_DISTANCE
]) {
  BY_ID.set(op.id, op)
}

export function getOperator(id: string | null | undefined): OperatorDef | undefined {
  if (!id) return undefined
  return BY_ID.get(id)
}

export function fieldTypeGroup(type: string): FieldTypeGroup {
  switch (type) {
    case 'keyword':
    case 'constant_keyword':
    case 'wildcard':
      return 'keyword'
    case 'text':
    case 'match_only_text':
      return 'text'
    case 'long':
    case 'integer':
    case 'short':
    case 'byte':
    case 'double':
    case 'float':
    case 'half_float':
    case 'scaled_float':
    case 'unsigned_long':
      return 'number'
    case 'date':
    case 'date_nanos':
      return 'date'
    case 'boolean':
      return 'boolean'
    case 'ip':
      return 'ip'
    case 'geo_point':
    case 'geo_shape':
      return 'geo'
    case 'object':
    case 'nested':
      return 'object'
    default:
      return 'unknown'
  }
}

const MATRIX: Record<FieldTypeGroup, OperatorDef[]> = {
  keyword: [EQUALS, NOT_EQUALS, ANY_OF, ALL_OF, PREFIX, WILDCARD, EXISTS, MISSING],
  text: [MATCH, MATCH_PHRASE, EXISTS, MISSING],
  number: [GREATER, GREATER_EQUAL, LESS, LESS_EQUAL, BETWEEN_NUMBER, EQUALS, EXISTS, MISSING],
  date: [RECENT, AFTER, BEFORE, BETWEEN_DATE, EXISTS, MISSING],
  boolean: [IS_TRUE, IS_FALSE, EXISTS, MISSING],
  ip: [EQUALS, CIDR, BETWEEN_NUMBER, EXISTS, MISSING],
  geo: [GEO_DISTANCE, EXISTS, MISSING],
  object: [],
  unknown: [EQUALS, EXISTS, MISSING]
}

export function operatorsForField(type: string): OperatorDef[] {
  return MATRIX[fieldTypeGroup(type)]
}

export function defaultOperatorForField(type: string): OperatorDef | undefined {
  const list = operatorsForField(type)
  return list.find((op) => op.default) ?? list[0]
}

/** 精确匹配类操作符，用于 text 字段的阻断校验。 */
export const EXACT_SEMANTICS: OperatorSemantic[] = [
  'eq',
  'ne',
  'any',
  'all',
  'prefix',
  'wildcard'
]

export function isExactSemantic(semantic: OperatorSemantic): boolean {
  return EXACT_SEMANTICS.includes(semantic)
}

/** 需要至少一个值的操作符。 */
export function requiresValue(op: OperatorDef): boolean {
  return op.valueKind !== 'none'
}

/** 聚合可用的字段：keyword 与数值、date 可聚合，text 不可。 */
export function canAggregate(field: FieldSchema): boolean {
  return field.aggregatable
}
