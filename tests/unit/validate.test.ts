import { describe, expect, it } from 'vitest'
import { validateQuery } from '@shared/query/validate'
import { createId } from '@shared/id'
import type { QueryCondition, QueryTree } from '@shared/types'

function condition(
  field: string,
  operator: string,
  value: QueryCondition['value']
): QueryCondition {
  return { kind: 'condition', id: createId('c'), field, operator, value }
}

function tree(children: QueryCondition[]): QueryTree {
  return {
    root: { kind: 'group', id: createId('g'), logic: 'all', children },
    exclusion: { kind: 'exclusion', id: createId('x'), children: [] }
  }
}

const fields = new Map([
  ['status.keyword', { type: 'keyword', aggregatable: true }],
  ['message', { type: 'text', aggregatable: false, keywordSubfield: 'message.keyword' }],
  ['message.keyword', { type: 'keyword', aggregatable: true }],
  ['latency_ms', { type: 'long', aggregatable: true }],
  ['@timestamp', { type: 'date', aggregatable: true }],
  ['tags', { type: 'keyword', aggregatable: true }]
])

const base = {
  fields,
  readOnly: false,
  operationId: 'search',
  docCount: 1_204_882,
  size: 20
}

describe('validateQuery', () => {
  it('text 字段精确匹配产生阻断，并给出改字段修复', () => {
    const issues = validateQuery(
      tree([condition('message', 'eq', { kind: 'scalar', value: 'timeout' })]),
      base
    )
    const blocking = issues.filter((issue) => issue.level === 'block')
    expect(blocking).toHaveLength(1)
    expect(blocking[0].fix?.kind).toBe('change-field')
    expect(blocking[0].fix?.payload.field).toBe('message.keyword')
  })

  it('数值字段非数字产生阻断', () => {
    const issues = validateQuery(
      tree([condition('latency_ms', 'gt', { kind: 'scalar', value: 'abc' })]),
      base
    )
    expect(issues.some((issue) => issue.level === 'block')).toBe(true)
  })

  it('区间倒置产生阻断并给出交换修复', () => {
    const issues = validateQuery(
      tree([condition('latency_ms', 'between_number', { kind: 'range', from: '900', to: '100' })]),
      base
    )
    const blocking = issues.find((issue) => issue.level === 'block')
    expect(blocking?.fix?.kind).toBe('swap-range')
  })

  it('前导通配产生预警并带估算', () => {
    const issues = validateQuery(
      tree([condition('status.keyword', 'wildcard', { kind: 'scalar', value: '*fail*' })]),
      base
    )
    const warning = issues.find((issue) => issue.level === 'warn')
    expect(warning?.estimate).toBeTruthy()
  })

  it('只读连接上的写操作产生阻断', () => {
    const issues = validateQuery(
      tree([condition('status.keyword', 'eq', { kind: 'scalar', value: 'active' })]),
      { ...base, readOnly: true, operationId: 'index-doc' }
    )
    expect(issues.some((issue) => issue.id === 'readonly-operation')).toBe(true)
  })

  it('无条件时给出全表扫描预警', () => {
    const issues = validateQuery(tree([]), base)
    expect(issues.some((issue) => issue.id === 'no-conditions')).toBe(true)
  })
})
