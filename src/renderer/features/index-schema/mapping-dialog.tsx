import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

export function MappingDialog({
  open,
  onOpenChange,
  index,
  mapping
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  index: string | null
  mapping: unknown
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const text = JSON.stringify(mapping ?? {}, null, 2)

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>mapping</DialogTitle>
          <DialogDescription>{index ?? '未选择索引'}</DialogDescription>
        </DialogHeader>

        <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted/50 p-4 font-mono text-xs leading-5">
          {text}
        </pre>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => void copy()}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? '已复制' : '复制 JSON'}
          </Button>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              关闭
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
