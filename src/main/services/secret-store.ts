import { existsSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { safeStorage } from 'electron'
import type { Auth } from '@shared/types'

interface SecretRow {
  cipher: Uint8Array
}

/**
 * 连接凭证存储。
 * 密文写入 userData/vault.db（SQLite），加密仍由系统钥匙串（safeStorage）负责：
 * 数据库文件被复制走也无法解密，库本身提供事务、唯一约束和后续扩展空间。
 * 旧版本的 secrets.json 会在首次启动时迁移进数据库，原文件改名为 secrets.json.migrated。
 */
export class SecretStore {
  private db: DatabaseSync | null = null
  private encrypted: boolean

  constructor(private dir: string) {
    this.encrypted = safeStorage.isEncryptionAvailable()
    try {
      this.db = new DatabaseSync(join(dir, 'vault.db'))
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS secrets (
          connection_id TEXT PRIMARY KEY,
          cipher BLOB NOT NULL,
          updated_at TEXT NOT NULL
        )
      `)
      this.migrateLegacyJson()
    } catch (error) {
      console.error('[secret-store] 打开凭证数据库失败', error)
      this.db = null
    }
  }

  private migrateLegacyJson(): void {
    const legacy = join(this.dir, 'secrets.json')
    if (!this.db || !existsSync(legacy)) return

    const counted = this.db.prepare('SELECT COUNT(*) AS total FROM secrets').get() as
      | { total: number }
      | undefined
    if ((counted?.total ?? 0) > 0) return

    try {
      const raw = JSON.parse(readFileSync(legacy, 'utf8')) as Record<string, unknown>
      const insert = this.db.prepare(
        'INSERT INTO secrets (connection_id, cipher, updated_at) VALUES (?, ?, ?)'
      )
      const now = new Date().toISOString()

      this.db.exec('BEGIN')
      let migrated = 0
      for (const [id, value] of Object.entries(raw)) {
        if (typeof value !== 'string' || value.length === 0) continue
        insert.run(id, Buffer.from(value, 'base64'), now)
        migrated += 1
      }
      this.db.exec('COMMIT')

      renameSync(legacy, `${legacy}.migrated`)
      console.log(`[secret-store] 已从 secrets.json 迁移 ${migrated} 条凭证到 vault.db`)
    } catch (error) {
      try {
        this.db.exec('ROLLBACK')
      } catch {
        // 事务未开启时忽略
      }
      console.error('[secret-store] 迁移旧凭证失败，保留 secrets.json 原文件', error)
    }
  }

  set(id: string, auth: Auth): void {
    if (!this.db) {
      throw new Error('凭证数据库不可用，无法保存连接凭证。')
    }
    const plain = JSON.stringify(auth)
    const cipher = this.encrypted
      ? safeStorage.encryptString(plain)
      : Buffer.from(plain, 'utf8')
    this.db
      .prepare(
        `INSERT INTO secrets (connection_id, cipher, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(connection_id) DO UPDATE SET cipher = excluded.cipher, updated_at = excluded.updated_at`
      )
      .run(id, cipher, new Date().toISOString())
  }

  get(id: string): Auth | null {
    if (!this.db) return null
    const row = this.db
      .prepare('SELECT cipher FROM secrets WHERE connection_id = ?')
      .get(id) as SecretRow | undefined
    if (!row) return null

    try {
      const buffer = Buffer.from(row.cipher)
      const plain = this.encrypted ? safeStorage.decryptString(buffer) : buffer.toString('utf8')
      return JSON.parse(plain) as Auth
    } catch (error) {
      console.error('[secret-store] 解密凭证失败', error)
      return null
    }
  }

  delete(id: string): void {
    if (!this.db) return
    this.db.prepare('DELETE FROM secrets WHERE connection_id = ?').run(id)
  }
}
