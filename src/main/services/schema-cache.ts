import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { IndexSchema } from '@shared/types'

const TTL_MS = 12 * 60 * 1000

export class SchemaCache {
  private memory = new Map<string, IndexSchema>()

  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true })
  }

  private key(connectionId: string, index: string): string {
    return `${connectionId}::${index}`
  }

  private file(key: string): string {
    return join(this.dir, `${key.replace(/[^a-zA-Z0-9_.-]/g, '_')}.json`)
  }

  get(connectionId: string, index: string): IndexSchema | null {
    const key = this.key(connectionId, index)
    const cached = this.memory.get(key)
    if (cached) return cached

    const file = this.file(key)
    if (!existsSync(file)) return null
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as IndexSchema
      this.memory.set(key, parsed)
      return parsed
    } catch {
      return null
    }
  }

  isFresh(schema: IndexSchema): boolean {
    return Date.now() - new Date(schema.cachedAt).getTime() < TTL_MS
  }

  set(connectionId: string, index: string, schema: IndexSchema): void {
    const key = this.key(connectionId, index)
    this.memory.set(key, schema)
    writeFileSync(this.file(key), JSON.stringify(schema), 'utf8')
  }

  invalidate(connectionId: string, index: string): void {
    this.memory.delete(this.key(connectionId, index))
  }
}
