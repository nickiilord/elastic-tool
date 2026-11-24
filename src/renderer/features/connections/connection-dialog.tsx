import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import type { Auth, ConnectionInput, Environment, TestResult } from '@shared/types'
import { api } from '@/lib/api'
import { friendlyConnectionError } from '@/lib/errors'
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
import { useConnectionDetail, useSaveConnection } from '@/lib/hooks/use-connections'
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
  const editingConnectionId = useUiStore((state) => state.editingConnectionId)
  const close = useUiStore((state) => state.closeConnectionDialog)
  const setConnection = useUiStore((state) => state.setConnection)
  const save = useSaveConnection()
  const detail = useConnectionDetail(open ? editingConnectionId : null)

  const editing = Boolean(editingConnectionId)
  const [form, setForm] = useState<ConnectionInput>(emptyForm)
  const [authType, setAuthType] = useState<AuthType>('none')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [apiId, setApiId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [token, setToken] = useState('')
  const [skipTls, setSkipTls] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  const hasSavedSecret = detail.data?.auth.hasSecret ?? false

  useEffect(() => {
    if (!open) return
    setTesting(false)
    setTestResult(null)
    if (!editingConnectionId) {
      setForm(emptyForm())
      setAuthType('none')
      setUsername('')
      setPassword('')
      setApiId('')
      setApiKey('')
      setToken('')
      setSkipTls(false)
      return
    }
    const data = detail.data
    if (!data) return
    setForm({
      id: data.id,
      name: data.name,
      url: data.url,
      environment: data.environment,
      readOnly: data.readOnly,
      // 凭证字段由 buildAuth 在提交时组装，这里只占位
      auth: { type: 'none' },
      tls: data.tls,
      proxy: data.proxy,
      timeoutMs: data.timeoutMs
    })
    setAuthType(data.auth.type)
    setUsername(data.auth.username ?? '')
    setApiId(data.auth.apiKeyId ?? '')
    setPassword('')
    setApiKey('')
    setToken('')
    setSkipTls(!data.tls.rejectUnauthorized)
  }, [open, editingConnectionId, detail.data])

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

  const buildInput = (): ConnectionInput => ({
    ...form,
    id: editingConnectionId ?? undefined,
    auth: buildAuth(),
    tls: { rejectUnauthorized: !skipTls }
  })

  const submit = (): void => {
    save.mutate(buildInput(), {
      onSuccess: (summary) => {
        if (editingConnectionId) {
          void detail.refetch()
        } else {
          setConnection(summary.id)
        }
        close()
      }
    })
  }

  const runTest = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(await api.connections.testDraft(buildInput()))
    } catch (error) {
      setTestResult({
        ok: false,
        latencyMs: 0,
        error: error instanceof Error ? error.message : '测试失败'
      })
    } finally {
      setTesting(false)
    }
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
              placeholder={hasSavedSecret ? '留空表示不修改' : '输入密码'}
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
              placeholder={hasSavedSecret ? '留空表示不修改' : '输入 API Key'}
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
            placeholder={hasSavedSecret ? '留空表示不修改' : '输入 Token'}
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
          <DialogTitle>{editing ? '编辑连接' : '新建连接'}</DialogTitle>
          <DialogDescription>
            {editing
              ? '修改后会沿用已保存的凭证，密码类字段留空表示不修改。'
              : '凭据用系统钥匙串加密后写入本地凭证数据库，配置文件不写密码。'}
          </DialogDescription>
        </DialogHeader>

        {editing && detail.isLoading ? (
          <p className="py-6 text-sm text-muted-foreground">正在读取连接信息…</p>
        ) : editing && detail.isError ? (
          <p className="py-6 text-sm text-destructive">
            连接信息读取失败：{detail.error instanceof Error ? detail.error.message : '未知错误'}
          </p>
        ) : (
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
                多个地址用逗号分隔，连接失败时会依次尝试；演示连接用 demo://local。
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
                  if (!value) return
                  setAuthType(value as AuthType)
                  setTestResult(null)
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

            {testResult ? (
              testResult.ok ? (
                <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-3.5 shrink-0" />
                  <span>
                    {[
                      '连接成功',
                      testResult.version ? `v${testResult.version}` : null,
                      testResult.clusterName ?? null,
                      `${testResult.latencyMs} ms`
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
              ) : (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
                  <div className="flex items-start gap-2">
                    <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                    <div className="min-w-0 flex-1">
                      <p className="text-destructive">
                        {friendlyConnectionError(testResult.error ?? '未知错误').title}
                      </p>
                      {friendlyConnectionError(testResult.error ?? '').detail ? (
                        <details className="mt-1">
                          <summary className="cursor-pointer select-none text-muted-foreground transition-colors hover:text-foreground">
                            查看详情
                          </summary>
                          <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-sm bg-background/60 p-2 font-mono text-[11px] leading-4 text-muted-foreground">
                            {friendlyConnectionError(testResult.error ?? '').detail}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            ) : null}

            {save.error ? (
              <p className="text-xs text-destructive">
                保存失败：{save.error instanceof Error ? save.error.message : '未知错误'}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            className="mr-auto"
            onClick={() => void runTest()}
            disabled={testing || !form.name.trim() || !form.url.trim()}
          >
            {testing ? <Loader2 className="size-4 animate-spin" /> : null}
            {testing ? '测试中…' : '测试连接'}
          </Button>
          <Button variant="outline" onClick={close}>
            取消
          </Button>
          <Button
            className="active:scale-[0.98]"
            onClick={submit}
            disabled={
              save.isPending || !form.name.trim() || !form.url.trim() || (editing && detail.isLoading)
            }
          >
            {save.isPending ? '保存中…' : editing ? '保存修改' : '保存并连接'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
