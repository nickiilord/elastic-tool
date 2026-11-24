import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Auth, Connection, ConnectionInput, ConnectionSummary } from '@shared/types'
import { SecretStore } from './secret-store'

interface StoredConnection extends Omit<Connection, 'auth'> {
  auth: Pick<Auth, 'type'>
}

export class ConnectionStore {
  private connections: StoredConnection[] = []
  private secrets: SecretStore

  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true })
    this.secrets = new SecretStore(join(dir, 'secrets.json'))
    this.load()
    this.ensureDemo()
  }

  private file(): string {
    return join(this.dir, 'connections.json')
  }

  private load(): void {
    const file = this.file()
    if (!existsSync(file)) return
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as StoredConnection[]
      if (Array.isArray(raw)) this.connections = raw
    } catch {
      this.connections = []
    }
  }

  private persist(): void {
    writeFileSync(this.file(), JSON.stringify(this.connections, null, 2), 'utf8')
  }

  private toSummary(connection: StoredConnection): ConnectionSummary {
    return {
      id: connection.id,
      name: connection.name,
      url: connection.url,
      environment: connection.environment,
      readOnly: connection.readOnly,
      status: 'unknown'
    }
  }

  private toConnection(stored: StoredConnection): Connection {
    const auth = this.secrets.get(stored.id)
    return {
      ...stored,
      auth: auth ?? { type: 'none' }
    }
  }

  list(): ConnectionSummary[] {
    return this.connections.map((connection) => this.toSummary(connection))
  }

  get(id: string): Connection | undefined {
    const stored = this.connections.find((connection) => connection.id === id)
    return stored ? this.toConnection(stored) : undefined
  }

  save(input: ConnectionInput): ConnectionSummary {
    const now = new Date().toISOString()
    const id = input.id ?? `conn_${Math.random().toString(36).slice(2, 10)}`
    const existing = this.connections.find((connection) => connection.id === id)

    const stored: StoredConnection = {
      id,
      name: input.name.trim(),
      url: input.url.trim(),
      environment: input.environment,
      readOnly: input.readOnly,
      auth: { type: input.auth.type },
      tls: input.tls,
      proxy: input.proxy,
      timeoutMs: input.timeoutMs ?? 30_000,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }

    if (input.auth.type !== 'none') {
      this.secrets.set(id, input.auth)
    } else {
      this.secrets.delete(id)
    }

    if (existing) {
      this.connections = this.connections.map((connection) =>
        connection.id === id ? stored : connection
      )
    } else {
      this.connections.push(stored)
    }

    this.persist()
    return this.toSummary(stored)
  }

  remove(id: string): void {
    this.connections = this.connections.filter((connection) => connection.id !== id)
    this.secrets.delete(id)
    this.persist()
  }

  private ensureDemo(): void {
    if (this.connections.length > 0) return
    const now = new Date().toISOString()
    this.connections.push({
      id: 'demo',
      name: 'es-prod-01',
      url: 'demo://local',
      environment: 'prod',
      readOnly: true,
      auth: { type: 'none' },
      tls: { rejectUnauthorized: true },
      timeoutMs: 30_000,
      createdAt: now,
      updatedAt: now
    })
    this.persist()
  }
}
