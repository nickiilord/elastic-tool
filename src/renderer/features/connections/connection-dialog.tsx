import { useEffect, useState } from 'react'
import type { Auth, ConnectionInput, Environment } from '@shared/types'
import { cn, toggleActiveClass } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useSaveConnection } from '@/lib/hooks/use-connections'
import { useUiStore } from '@/stores/ui-store'

type AuthType = Auth['type']

const AUTH_OPTIONS: Array<{ value: AuthType; label: string }> = [
  { value: 'none', label: '无认证' },
  { value: 'basic', label: 'Basic' },
  { value: 'apiKey', label: 'API Key' },
  { value: 'bearer', label: 'Bearer' }
]

const ENVIRONMENT_OPTIONS: Array<{ value: Environment; label: string }> = [
  { value: 'dev', label: '开发' },
  { value: 'staging', label: '预发' },
  { value: 'prod', label: '生产' }
]

function emptyForm(): ConnectionInput {
  return {
    name: 'es-prod-01',
    url: 'https://es-prod-01:9200',
    environment: 'prod',
    readOnly: true,
    auth: { type: 'none' },
    tls: { rejectUnauthorized: true },
    timeoutMs: 30_000
  }
}

export function ConnectionDialog(): React.JSX.Element {
  const open = useUiStore((state) => state.connectionDialogOpen)
  const close = useUiStore((state) => state.closeConnectionDialog)
  const setConnection = useUiStore((state) => state.setConnection)
  const save = useSaveConnection()

  const [form, setForm] = useState<ConnectionInput>(emptyForm)
  const [authType, setAuthType] = useState<AuthType>('none')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [apiId, setApiId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [token, setToken] = useState('')
  const [skipTls, setSkipTls] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(emptyForm())
    setAuthType('none')
    setUsername('')
    setPassword('')
    setApiId('')
    setApiKey('')
    setToken('')
    setSkipTls(false)
  }, [open])

  const buildAuth = (): Auth => {
    switch (authType) {
      case 'basic':
        return { type: 'basic', username, password }
      case 'apiKey':
        return { type: 'apiKey', id: apiId, key: apiKey }
      case 'bearer':
        return { type: 'bearer', token }
      default:
        return { type: 'none' }
    }
  }

  const submit = (): void => {
    const input: ConnectionInput = {
      ...form,
      auth: buildAuth(),
      tls: { rejectUnauthorized: !skipTls }
    }
    save.mutate(input, {
      onSuccess: (summary) => {
        setConnection(summary.id)
        close()
      }
    })
  }

  const authFields = (): React.JSX.Element | null => {
    if (authType === 'basic') {
      return (
        <div className="grid animate-in gap-3 fade-in-0 duration-150">
          <div className="grid gap-1.5">
            <Label htmlFor="connection-username">用户名</Label>
            <Input
              id="connection-username"
              className="h-8"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="connection-password">密码</Label>
            <Input
              id="connection-password"
              className="h-8"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        </div>
      )
    }
    if (authType === 'apiKey') {
      return (
        <div className="grid animate-in gap-3 fade-in-0 duration-150">
          <div className="grid gap-1.5">
            <Label htmlFor="connection-api-id">API Key ID</Label>
            <Input
              id="connection-api-id"
              className="h-8"
              value={apiId}
              onChange={(event) => setApiId(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="connection-api-key">API Key</Label>
            <Input
              id="connection-api-key"
              className="h-8"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </div>
        </div>
      )
    }
    if (authType === 'bearer') {
      return (
        <div className="grid animate-in gap-1.5 fade-in-0 duration-150">
          <Label htmlFor="connection-token">Token</Label>
          <Input
            id="connection-token"
            className="h-8"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
        </div>
      )
    }
    return null
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>新建连接</DialogTitle>
          <DialogDescription>凭据存系统钥匙串，配置文件不写密码。</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="connection-name">名称</Label>
            <Input
              id="connection-name"
              className="h-8"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="connection-url">节点地址</Label>
            <Input
              id="connection-url"
              className="h-8"
              value={form.url}
              onChange={(event) => setForm({ ...form, url: event.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              多个地址用逗号分隔；演示连接用 demo://local。
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label>认证方式</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={authType}
              onValueChange={(value) => {
                if (value) setAuthType(value as AuthType)
              }}
              className="w-fit"
            >
              {AUTH_OPTIONS.map((option) => (
                <ToggleGroupItem
                  key={option.value}
                  value={option.value}
                  className={cn('px-2.5 text-xs', toggleActiveClass)}
                >
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {authFields()}

          <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
            <div className="grid gap-1">
              <Label htmlFor="connection-skip-tls">跳过证书校验</Label>
              <p className="text-xs text-muted-foreground">
                仅自签证书环境使用，会关闭证书链校验。
              </p>
            </div>
            <Switch id="connection-skip-tls" checked={skipTls} onCheckedChange={setSkipTls} />
          </div>

          <div className="grid gap-1.5">
            <Label>环境</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={form.environment}
              onValueChange={(value) => {
                if (!value) return
                const environment = value as Environment
                setForm({
                  ...form,
                  environment,
                  readOnly: environment === 'prod' ? true : form.readOnly
                })
              }}
              className="w-fit"
            >
              {ENVIRONMENT_OPTIONS.map((option) => (
                <ToggleGroupItem
                  key={option.value}
                  value={option.value}
                  className={cn('px-2.5 text-xs', toggleActiveClass)}
                >
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">生产环境默认开启只读模式。</p>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
            <div className="grid gap-1">
              <Label htmlFor="connection-read-only">只读模式</Label>
              <p className="text-xs text-muted-foreground">拦截非 GET 请求，执行前二次确认。</p>
            </div>
            <Switch
              id="connection-read-only"
              checked={form.readOnly}
              onCheckedChange={(readOnly) => setForm({ ...form, readOnly })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            取消
          </Button>
          <Button
            className="active:scale-[0.98]"
            onClick={submit}
            disabled={save.isPending || !form.name.trim() || !form.url.trim()}
          >
            {save.isPending ? '保存中…' : '保存并连接'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
