import { describe, expect, it } from 'vitest'
import { compileQuery } from '@shared/query/compile'
import { createId } from '@shared/id'
import type { QueryCondition, QueryTree } from '@shared/types'

function condition(
  field: string,
  operator: string,
  value: QueryCondition['value']
): QueryCondition {
  return { kind: 'condition', id: createId('c'), field, operator, value }
}

function tree(children: QueryTree['root']['children'], logic: 'all' | 'any' = 'all'): QueryTree {
  return {
    root: { kind: 'group', id: createId('g'), logic, children },
    exclusion: { kind: 'exclusion', id: createId('x'), children: [] }
  }
}

const fields = new Map([
  ['status.keyword', { type: 'keyword', aggregatable: true }],
  ['message', { type: 'text', aggregatable: false, keywordSubfield: 'message.keyword' }],
  ['message.keyword', { type: 'keyword', aggregatable: true }],
  ['latency_ms', { type: 'long', aggregatable: true }],
  ['@timestamp', { type: 'date', aggregatable: true }],
  ['user.id', { type: 'keyword', aggregatable: true }]
])

const ctx = { fields, size: 20, trackTotalHits: true, sort: null }

describe('compileQuery', () => {
  it('把包含全部编译成多个 term，而不是一个 terms', () => {
    const result = compileQuery(
      tree([condition('user.id', 'all', { kind: 'list', values: ['a', 'b'] })]),
      ctx
    )
    const dsl = result.dsl as { query: { bool: { must: unknown[] } } }
    const must = dsl.query.bool.must[0] as { bool: { must: Array<{ term: unknown }> } }
    expect(must.bool.must).toHaveLength(2)
    expect(must.bool.must[0]).toEqual({ term: { 'user.id': 'a' } })
  })

  it('根组任一满足带 minimum_should_match', () => {
    const result = compileQuery(
      tree(
        [
          condition('latency_ms', 'gt', { kind: 'scalar', value: '1000' }),
          condition('status.keyword', 'eq', { kind: 'scalar', value: 'error' })
        ],
        'any'
      ),
      ctx
    )
    const dsl = result.dsl as {
      query: { bool: { should: unknown[]; minimum_should_match: number } }
    }
    expect(dsl.query.bool.should).toHaveLength(2)
    expect(dsl.query.bool.minimum_should_match).toBe(1)
  })

  it('排除条件进入 must_not', () => {
    const base = tree([condition('status.keyword', 'eq', { kind: 'scalar', value: 'active' })])
    base.exclusion.children.push(
      condition('user.id', 'eq', { kind: 'scalar', value: 'u_00000' })
    )
    const result = compileQuery(base, ctx)
    const dsl = result.dsl as { query: { bool: { must_not: unknown[] } } }
    expect(dsl.query.bool.must_not).toHaveLength(1)
  })

  it('空条件不计入 DSL，但计入未完成数量', () => {
    const result = compileQuery(
      tree([condition('status.keyword', 'eq', { kind: 'scalar', value: '' })]),
      ctx
    )
    expect(result.incompleteCount).toBe(1)
    expect(result.dsl).toEqual({ size: 20, track_total_hits: true })
  })

  it('时间相对范围编译成 now-Nd', () => {
    const result = compileQuery(
      tree([condition('@timestamp', 'recent', { kind: 'relative', amount: 7, unit: 'd' })]),
      ctx
    )
    const dsl = result.dsl as { query: { bool: { must: Array<{ range: Record<string, unknown> }> } } }
    expect(dsl.query.bool.must[0].range).toEqual({ '@timestamp': { gte: 'now-7d' } })
  })

  it('第一页不写 from，翻页时写入 from', () => {
    const pages = tree([
      condition('status.keyword', 'eq', { kind: 'scalar', value: 'active' })
    ])
    const first = compileQuery(pages, ctx)
    expect((first.dsl as Record<string, unknown>).from).toBeUndefined()

    const second = compileQuery(pages, { ...ctx, from: 40 })
    expect((second.dsl as Record<string, unknown>).from).toBe(40)
    expect((second.dsl as Record<string, unknown>).size).toBe(20)
  })
})
