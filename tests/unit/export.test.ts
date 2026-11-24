import { describe, expect, it } from 'vitest'
import { csvCell, toCsv } from '@shared/export'

describe('csv', () => {
  it('转义逗号、引号与换行', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"')
    expect(csvCell(null)).toBe('')
    expect(csvCell(42)).toBe('42')
  })

  it('生成表头与数据行', () => {
    expect(toCsv(['_id', 'status'], [['a', 'active'], ['b', 'pending']])).toBe(
      '_id,status\na,active\nb,pending'
    )
  })
})
