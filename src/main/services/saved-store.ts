import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SavedQuery } from '@shared/types'
import type { SavedQueryInput } from '@shared/ipc'

export class SavedStore {
  private items: SavedQuery[] = []

  constructor(private dir: string) {
    const file = this.file()
    if (existsSync(file)) {
      try {
        const raw = JSON.parse(readFileSync(file, 'utf8')) as SavedQuery[]
        if (Array.isArray(raw)) this.items = raw
      } catch {
        this.items = []
      }
    }
  }

  private file(): string {
    return join(this.dir, 'saved-queries.json')
  }

  private persist(): void {
    writeFileSync(this.file(), JSON.stringify(this.items, null, 2), 'utf8')
  }

  list(): SavedQuery[] {
    return [...this.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  save(input: SavedQueryInput): SavedQuery {
    const now = new Date().toISOString()
    const item: SavedQuery = {
      id: input.id ?? `saved_${Math.random().toString(36).slice(2, 10)}`,
      name: input.name.trim() || '未命名查询',
      connectionId: input.connectionId,
      index: input.index,
      tree: input.tree,
      options: input.options,
      dslText: input.dslText,
      createdAt: now
    }
    const existing = this.items.findIndex((entry) => entry.id === item.id)
    if (existing >= 0) {
      item.createdAt = this.items[existing].createdAt
      this.items[existing] = item
    } else {
      this.items.push(item)
    }
    this.persist()
    return item
  }

  remove(id: string): void {
    this.items = this.items.filter((entry) => entry.id !== id)
    this.persist()
  }
}
