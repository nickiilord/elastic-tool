import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HistoryEntry } from '@shared/types'

const MAX_ENTRIES = 200

export class HistoryStore {
  private entries: HistoryEntry[] = []

  constructor(private dir: string) {
    const file = this.file()
    if (existsSync(file)) {
      try {
        const raw = JSON.parse(readFileSync(file, 'utf8')) as HistoryEntry[]
        if (Array.isArray(raw)) this.entries = raw
      } catch {
        this.entries = []
      }
    }
  }

  private file(): string {
    return join(this.dir, 'history.json')
  }

  private persist(): void {
    writeFileSync(this.file(), JSON.stringify(this.entries), 'utf8')
  }

  list(connectionId?: string): HistoryEntry[] {
    const list = connectionId
      ? this.entries.filter((entry) => entry.connectionId === connectionId)
      : this.entries
    return [...list].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }

  add(entry: HistoryEntry): void {
    this.entries.unshift(entry)
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(0, MAX_ENTRIES)
    }
    this.persist()
  }

  clear(): void {
    this.entries = []
    this.persist()
  }
}
