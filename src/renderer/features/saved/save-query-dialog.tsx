import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
import { api } from '@/lib/api'
import { useQueryDocument } from '@/stores/query-store'
import { useUiStore } from '@/stores/ui-store'

export function SaveQueryDialog(): React.JSX.Element {
  const open = useUiStore((state) => state.saveQueryOpen)
  const close = useUiStore((state) => state.closeSaveQuery)
  const queryDocument = useQueryDocument()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !queryDocument) return
    setName(queryDocument.index ? `${queryDocument.index} 查询` : queryDocument.title)
  }, [open, queryDocument])

  const submit = async (): Promise<void> => {
    if (!queryDocument) return
    setSaving(true)
    try {
      await api.saved.save({
        name: name.trim() || queryDocument.title,
        connectionId: queryDocument.connectionId,
        index: queryDocument.index,
        tree: queryDocument.tree,
        options: queryDocument.options,
        dslText: queryDocument.dslText
      })
      await queryClient.invalidateQueries({ queryKey: ['saved'] })
      close()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>保存查询</DialogTitle>
          <DialogDescription>
            <span>{queryDocument?.index ?? '未选择索引'}</span>
            {' · '}条件树、排序与返回条数会一起保存。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <Label htmlFor="saved-query-name">名称</Label>
          <Input
            id="saved-query-name"
            className="h-8"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit()
            }}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            取消
          </Button>
          <Button
            className="active:scale-[0.98]"
            onClick={() => void submit()}
            disabled={saving || !queryDocument}
          >
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
