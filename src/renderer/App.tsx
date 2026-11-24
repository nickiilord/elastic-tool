import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useConnections } from '@/lib/hooks/use-connections'
import { useThemeEffect } from '@/lib/hooks/use-theme'
import { useUiStore } from '@/stores/ui-store'
import { TitleBar } from '@/components/layout/title-bar'
import { Sidebar } from '@/components/layout/sidebar'
import { StatusBar } from '@/components/layout/status-bar'
import { FieldPanel } from '@/components/layout/field-panel'
import { CommandPalette } from '@/components/command/command-palette'
import { ConnectionDialog } from '@/features/connections/connection-dialog'
import { DeleteConnectionDialog } from '@/features/connections/delete-connection-dialog'
import { SaveQueryDialog } from '@/features/saved/save-query-dialog'
import { SettingsDialog } from '@/features/settings/settings-dialog'
import { DiagnosticsPage } from '@/features/diagnostics/diagnostics-page'
import { QueryWorkspace } from '@/features/workspace/query-workspace'

function Fallback(): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
      preload 未加载，请通过 pnpm dev 启动应用。
    </div>
  )
}

function AppShell(): React.JSX.Element {
  const view = useUiStore((state) => state.view)
  const connectionId = useUiStore((state) => state.connectionId)
  const setConnection = useUiStore((state) => state.setConnection)
  const openConnectionDialog = useUiStore((state) => state.openConnectionDialog)
  const setCommandOpen = useUiStore((state) => state.setCommandOpen)
  const openSaveQuery = useUiStore((state) => state.openSaveQuery)
  const queryClient = useQueryClient()

  const { data: connections = [] } = useConnections()

  useThemeEffect()

  useEffect(() => {
    if (!connectionId && connections.length > 0) {
      setConnection(connections[0].id)
    }
  }, [connectionId, connections, setConnection])

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      const modifier = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()

      if (modifier && key === 'k') {
        event.preventDefault()
        setCommandOpen(true)
        return
      }
      if (modifier && key === 'n') {
        event.preventDefault()
        openConnectionDialog()
        return
      }
      if (modifier && key === 's') {
        event.preventDefault()
        openSaveQuery()
        return
      }
      if (event.key === 'F5') {
        event.preventDefault()
        void queryClient.invalidateQueries({ queryKey: ['indices'] })
        void queryClient.invalidateQueries({ queryKey: ['schema'] })
        void queryClient.invalidateQueries({ queryKey: ['diagnostics'] })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setCommandOpen, openConnectionDialog, openSaveQuery, queryClient])

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        {view === 'query' ? <QueryWorkspace /> : <DiagnosticsPage />}
        {view === 'query' ? <FieldPanel /> : null}
      </div>
      <StatusBar />
      <ConnectionDialog />
      <DeleteConnectionDialog />
      <SaveQueryDialog />
      <SettingsDialog />
      <CommandPalette />
    </div>
  )
}

export function App(): React.JSX.Element {
  if (typeof window === 'undefined' || !window.api) return <Fallback />
  return <AppShell />
}
