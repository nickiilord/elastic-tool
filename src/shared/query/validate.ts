import type { QueryCondition, QueryTree, ValidationIssue } from '../types'
import { getOperation } from '../operations'
import { fieldTypeGroup, getOperator, isExactSemantic } from './operators'

export interface ValidateFieldMeta {
  type: string
  aggregatable: boolean
  keywordSubfield?: string
}

export interface ValidateContext {
  fields: Map<string, ValidateFieldMeta>
  readOnly: boolean
  operationId: string
  docCount: number
  size: number
  aggregationField?: string | null
}

const DATE_MATH = /^now([+-]\d+[smhdwMy])?(\/[smhdwMy])?$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/

function isDateLike(raw: string): boolean {
  if (DATE_MATH.test(raw)) return true
  if (/^\d+$/.test(raw)) return true
  if (ISO_DATE.test(raw)) return !Number.isNaN(Date.parse(raw))
  return false
}

function scalarText(condition: QueryCondition): string | null {
  const value = condition.value
  if (!value) return null
  if (value.kind === 'scalar') return String(value.value)
  return null
}

function listValues(condition: QueryCondition): string[] {
  const value = condition.value
  if (!value) return []
  if (value.kind === 'list') return value.values
  return []
}

function estimateScan(docCount: number): string {
  const seconds = docCount / 500_000
  return seconds >= 1 ? `${seconds.toFixed(1)} s` : '< 1 s'
}

function walkConditions(tree: QueryTree): QueryCondition[] {
  const out: QueryCondition[] = []
  const visitGroup = (group: QueryTree['root']): void => {
    for (const child of group.children) {
      if (child.kind === 'condition') out.push(child)
      else visitGroup(child)
    }
  }
  visitGroup(tree.root)
  out.push(...tree.exclusion.children)
  return out
}

export function validateQuery(tree: QueryTree, ctx: ValidateContext): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const operation = getOperation(ctx.operationId)

  if (operation?.write && ctx.readOnly) {
    issues.push({
      id: 'readonly-operation',
      level: 'block',
      conditionId: 'operation',
      field: operation.label,
      message: '当前连接是只读模式，写入类操作已禁用。',
      meta: 'readonly'
    })
  }

  const conditions = walkConditions(tree)
  let usable = 0

  for (const condition of conditions) {
    if (!condition.field || !condition.operator) continue
    usable += 1

    const meta = ctx.fields.get(condition.field)
    const op = getOperator(condition.operator)
    const issueBase = {
      conditionId: condition.id,
      field: condition.field
    }

    if (!meta) {
      issues.push({
        ...issueBase,
        id: `${condition.id}-field-missing`,
        level: 'block',
        message: '字段在 mapping 中不存在，可能来自过期的 schema 缓存。',
        meta: 'mapping'
      })
      continue
    }

    if (!op) {
      issues.push({
        ...issueBase,
        id: `${condition.id}-operator-missing`,
        level: 'block',
        message: '操作符无法识别，请重新选择。',
        meta: 'operator'
      })
      continue
    }

    const group = fieldTypeGroup(meta.type)

    if (group === 'text' && isExactSemantic(op.semantic)) {
      const fix = meta.keywordSubfield
        ? {
            label: '改用 .keyword',
            kind: 'change-field' as const,
            payload: { field: meta.keywordSubfield }
          }
        : {
            label: '换成「匹配」',
            kind: 'change-operator' as const,
            payload: { operator: 'match' }
          }
      issues.push({
        ...issueBase,
        id: `${condition.id}-text-exact`,
        level: 'block',
        message: `${condition.field} 是 text 字段，不支持精确匹配，无法生成 term 查询。`,
        meta: 'text · term',
        fix
      })
    }

    if (group === 'number' && op.semantic !== 'exists' && op.semantic !== 'missing') {
      const raw = scalarText(condition)
      const range = condition.value?.kind === 'range' ? condition.value : null
      const candidates = range ? [range.from, range.to] : [raw]
      const invalid = candidates.some(
        (item) => item !== null && item !== '' && !Number.isFinite(Number(item))
      )
      if (invalid) {
        issues.push({
          ...issueBase,
          id: `${condition.id}-not-number`,
          level: 'block',
          message: '数值字段只能填数字，当前值无法解析。',
          meta: 'number'
        })
      }
    }

    if (group === 'date' && (op.semantic === 'after' || op.semantic === 'before')) {
      const raw = scalarText(condition)
      if (raw !== null && raw !== '' && !isDateLike(raw)) {
        issues.push({
          ...issueBase,
          id: `${condition.id}-bad-date`,
          level: 'block',
          message: '日期无法解析，支持 ISO 时间、epoch 与 now-7d 这类写法。',
          meta: 'date'
        })
      }
    }

    if (op.semantic === 'between') {
      const range = condition.value?.kind === 'range' ? condition.value : null
      if (range && range.from && range.to) {
        const from = group === 'number' ? Number(range.from) : Date.parse(range.from)
        const to = group === 'number' ? Number(range.to) : Date.parse(range.to)
        if (Number.isFinite(from) && Number.isFinite(to) && from > to) {
          issues.push({
            ...issueBase,
            id: `${condition.id}-range-order`,
            level: 'block',
            message: '区间起点大于终点，无法生成 range 查询。',
            meta: 'range',
            fix: { label: '交换两端', kind: 'swap-range', payload: {} }
          })
        }
      }
    }

    if ((op.semantic === 'any' || op.semantic === 'all') && listValues(condition).length === 0) {
      issues.push({
        ...issueBase,
        id: `${condition.id}-empty-list`,
        level: 'block',
        message: '多值操作符至少需要一个值。',
        meta: 'terms'
      })
    }

    if (op.semantic === 'wildcard') {
      const raw = scalarText(condition)
      if (raw && raw.startsWith('*')) {
        issues.push({
          ...issueBase,
          id: `${condition.id}-leading-wildcard`,
          level: 'warn',
          message: '前导通配对 keyword 字段会退化为逐词扫描，大索引上耗时明显。',
          meta: 'wildcard',
          estimate: estimateScan(ctx.docCount)
        })
      }
    }

    if (op.semantic === 'any' || op.semantic === 'all') {
      const count = listValues(condition).length
      if (count > 100) {
        issues.push({
          ...issueBase,
          id: `${condition.id}-too-many-values`,
          level: 'warn',
          message: `一次传入 ${count} 个值，建议拆成多次查询或改用匹配。`,
          meta: 'terms'
        })
      }
    }
  }

  if (ctx.aggregationField && ctx.fields.has(ctx.aggregationField)) {
    const meta = ctx.fields.get(ctx.aggregationField)
    if (meta && fieldTypeGroup(meta.type) === 'text') {
      issues.push({
        id: 'agg-text-field',
        level: 'warn',
        conditionId: 'aggregation',
        field: ctx.aggregationField,
        message: 'text 字段不可聚合，可能得不到结果；改为同名的 .keyword 字段。',
        meta: 'aggs'
      })
    }
  }

  if (usable === 0 && ctx.docCount > 100_000) {
    issues.push({
      id: 'no-conditions',
      level: 'warn',
      conditionId: 'root',
      field: '*',
      message: `没有任何条件，将扫描全部 ${ctx.docCount.toLocaleString('zh-CN')} 条文档，建议至少给一个时间范围。`,
      meta: 'match_all'
    })
  }

  return issues
}
