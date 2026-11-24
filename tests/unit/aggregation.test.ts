import { describe, expect, it } from 'vitest'
import type { FieldSchema } from '@shared/types'
import {
  aggregationName,
  buildAggregations,
  pickAggregationField
} from '@shared/query/aggregation'

const fields: FieldSchema[] = [
  { path: '_id', type: 'keyword', aggregatable: false, searchable: true },
  { path: 'status', type: 'keyword', aggregatable: true, searchable: true },
  { path: 'message', type: 'text', aggregatable: false, searchable: true },
  { path: 'latency_ms', type: 'long', aggregatable: true, searchable: true },
  {
    path: 'user',
    type: 'object',
    aggregatable: false,
    searchable: true,
    children: [{ path: 'user.id', type: 'keyword', aggregatable: true, searchable: true }]
  }
]

describe('aggregation', () => {
  it('优先使用指定的可聚合字段', () => {
    expect(pickAggregationField(fields, 'latency_ms')?.path).toBe('latency_ms')
  })

  it('默认取第一个可聚合字段，跳过 text 与 object', () => {
    expect(pickAggregationField(fields)?.path).toBe('status')
  })

  it('生成 terms 聚合与稳定名称', () => {
    const field = pickAggregationField(fields, 'latency_ms')
    expect(field).not.toBeNull()
    expect(aggregationName(field as FieldSchema)).toBe('by_latency_ms')
    expect(buildAggregations(field)).toEqual({
      by_latency_ms: { terms: { field: 'latency_ms', size: 10 } }
    })
  })

  it('没有可聚合字段时返回 null', () => {
    expect(buildAggregations(null)).toBeNull()
  })
})
