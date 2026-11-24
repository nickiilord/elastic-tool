import { useMemo } from 'react'
import { appendCondition, createCondition } from '@shared/query/tree'
import { defaultConditionForField } from '@shared/query/values'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { useConnections } from '@/lib/hooks/use-connections'
import { useIndices } from '@/lib/hooks/use-indices'
import { useHistory } from '@/lib/hooks/use-history'
import { useSchema } from '@/lib/hooks/use-schema'
import { flattenFields } from '@/features/query-builder/field-picker'
import { useQueryDocument, useQueryStore } from '@/stores/query-store'
import { useUiStore } from '@/stores/ui-store'

interface CommandEntry {
  id: string
  label: string
  hint: string
  run: () => void
}

export function CommandPalette(): React.JSX.Element {
  const open = useUiStore((state) => state.commandOpen)
  const setOpen = useUiStore((state) => state.setCommandOpen)
  const connectionId = useUiStore((state) => state.connectionId)
  const index = useUiStore((state) => state.index)
  const document = useQueryDocument()

  const { data: connections = [] } = useConnections()
  const { data: indices = [] } = useIndices(connectionId)
  const { data: history = [] } = useHistory(connectionId)
  const { data: schema } = useSchema(connectionId, index)

  const items = useMemo<CommandEntry[]>(() => {
    const list: CommandEntry[] = []

    if (connectionId) {
      for (const indexEntry of indices) {
        list.push({
          id: `index-${indexEntry.name}`,
          label: indexEntry.name,
          hint: '索引 · 查询',
          run: () => {
            useUiStore.getState().setIndex(indexEntry.name)
            useQueryStore.getState().load(connectionId, indexEntry.name)
          }
        })
      }
    }

    for (const connection of connections) {
      list.push({
        id: `connection-${connection.id}`,
        label: connection.name,
        hint: '连接 · 诊断',
        run: () => {
          useUiStore.getState().setConnection(connection.id)
          useUiStore.getState().setView('diagnostics')
        }
      })
    }

    if (document && schema) {
      for (const field of flattenFields(schema.fields)) {
        if (field.children) continue
        list.push({
          id: `field-${field.path}`,
          label: field.path,
          hint: '字段 · 加条件',
          run: () => {
            const current = useQueryStore.getState().document
            if (!current) return
            const { operator, value } = defaultConditionForField(field)
            const tree = appendCondition(current.tree, createCondition(field.path, operator, value))
            useQueryStore.getState().updateTree(tree)
          }
        })
      }
    }

    for (const entry of history.slice(0, 10)) {
      const historyIndex = entry.index
      if (!historyIndex) continue
      list.push({
        id: `history-${entry.id}`,
        label: `${historyIndex}/${entry.operationId}`,
        hint: `${entry.durationMs} ms`,
        run: () => {
          useUiStore.getState().setIndex(historyIndex)
          useQueryStore.getState().load(entry.connectionId, historyIndex)
          useQueryStore.getState().update({ operationId: entry.operationId, page: 0 })
        }
      })
    }

    return list
  }, [connectionId, indices, connections, history, schema, document])

  const runEntry = (entry: CommandEntry): void => {
    entry.run()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="max-w-xl gap-0 overflow-hidden p-0 sm:max-w-xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">命令面板</DialogTitle>
        <DialogDescription className="sr-only">
          搜索并跳转到索引、连接、字段或最近的查询
        </DialogDescription>
        <Command
          loop
          className="**:data-[slot=command-input-wrapper]:h-10 **:data-[slot=command-input]:h-10 **:data-[slot=command-input]:py-2"
        >
          <CommandInput autoFocus placeholder="搜索或跳转：索引、连接、字段、历史" />
          <CommandList className="max-h-80">
            <CommandEmpty className="py-8 text-center text-xs text-muted-foreground">
              没有匹配项
            </CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.label}
                  keywords={[item.hint]}
                  onSelect={() => runEntry(item)}
                  className="h-9 px-3 transition-colors"
                >
                  <span className="min-w-0 flex-1 truncate text-xs">{item.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{item.hint}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <div className="flex h-9 shrink-0 items-center gap-1 border-t border-border px-3 text-xs text-muted-foreground">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <span className="ml-1">选择</span>
            <Kbd className="ml-3">Enter</Kbd>
            <span className="ml-1">打开</span>
            <Kbd className="ml-3">Esc</Kbd>
            <span className="ml-1">关闭</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
