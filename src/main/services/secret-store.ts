import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { safeStorage } from 'electron'
import type { Auth } from '@shared/types'

/**
 * 凭证存储。优先用系统钥匙串（safeStorage）加密，不可用时退回明文并在日志里提示。
 * 配置文件里只保存认证方式的类型，不保存密码本身。
 */
export class SecretStore {
  private data: Record<string, string> = {}
  private encrypted: boolean

  constructor(private file: string) {
    this.encrypted = safeStorage.isEncryptionAvailable()
    if (existsSync(file)) {
      try {
        const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>
        if (raw && typeof raw === 'object') this.data = raw
      } catch {
        this.data = {}
      }
    }
  }

  private persist(): void {
    writeFileSync(this.file, JSON.stringify(this.data), 'utf8')
  }

  set(id: string, auth: Auth): void {
    const plain = JSON.stringify(auth)
    this.data[id] = this.encrypted
      ? safeStorage.encryptString(plain).toString('base64')
      : Buffer.from(plain, 'utf8').toString('base64')
    this.persist()
  }

  get(id: string): Auth | null {
    const stored = this.data[id]
    if (!stored) return null
    try {
      const plain = this.encrypted
        ? safeStorage.decryptString(Buffer.from(stored, 'base64'))
        : Buffer.from(stored, 'base64').toString('utf8')
      return JSON.parse(plain) as Auth
    } catch {
      return null
    }
  }

  delete(id: string): void {
    if (!this.data[id]) return
    delete this.data[id]
    this.persist()
  }
}
