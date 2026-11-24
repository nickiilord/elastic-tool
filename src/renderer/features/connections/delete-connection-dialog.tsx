import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useConnections, useRemoveConnection } from '@/lib/hooks/use-connections'
import { useUiStore } from '@/stores/ui-store'

export function DeleteConnectionDialog(): React.JSX.Element {
  const deleteId = useUiStore((state) => state.deleteConnectionId)
  const close = useUiStore((state) => state.closeDeleteConnection)
  const connectionId = useUiStore((state) => state.connectionId)
  const setConnection = useUiStore((state) => state.setConnection)
  const { data: connections = [] } = useConnections()
  const remove = useRemoveConnection()
  const [error, setError] = useState<string | null>(null)

  const connection = connections.find((entry) => entry.id === deleteId) ?? null

  const submit = async (): Promise<void> => {
    if (!deleteId) return
    setError(null)
    try {
      await remove.mutateAsync(deleteId)
      if (connectionId === deleteId) {
        const next = connections.find((entry) => entry.id !== deleteId)
        setConnection(next ? next.id : null)
      }
      close()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '删除失败')
    }
  }

  return (
    <Dialog open={Boolean(deleteId)} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <span className="flex size-9 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-4" />
          </span>
          <DialogTitle>删除连接</DialogTitle>
          <DialogDescription>
            确定删除{' '}
            <span className="text-foreground">{connection?.name ?? deleteId}</span>？
          </DialogDescription>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          保存的凭证会一并删除，历史记录与收藏查询不会自动清理。此操作不可撤销。
        </p>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            取消
          </Button>
          <Button
            variant="destructive"
            className="active:scale-[0.98]"
            onClick={() => void submit()}
            disabled={remove.isPending}
          >
            {remove.isPending ? '删除中…' : '删除连接'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
