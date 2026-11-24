import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { readThemePreference, type ThemePreference } from '@/lib/theme'

export type WorkspaceView = 'query' | 'diagnostics'

interface UiState {
  connectionId: string | null
  index: string | null
  view: WorkspaceView
  theme: ThemePreference
  commandOpen: boolean
  connectionDialogOpen: boolean
  editingConnectionId: string | null
  saveQueryOpen: boolean
  settingsOpen: boolean
  fieldPanelOpen: boolean
  deleteConnectionId: string | null
  setConnection: (id: string | null) => void
  setIndex: (index: string) => void
  setView: (view: WorkspaceView) => void
  setTheme: (theme: ThemePreference) => void
  setCommandOpen: (open: boolean) => void
  openConnectionDialog: (connectionId?: string | null) => void
  closeConnectionDialog: () => void
  openSaveQuery: () => void
  closeSaveQuery: () => void
  openSettings: () => void
  closeSettings: () => void
  openDeleteConnection: (id: string) => void
  closeDeleteConnection: () => void
  toggleFieldPanel: () => void
}

/**
 * 界面状态。当前连接、索引、视图与字段面板开关会持久化，重启后恢复。
 * 主题偏好单独存在 localStorage 的 elastic-tool:theme 里，由首帧脚本读取。
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      connectionId: null,
      index: null,
      view: 'query',
      theme: readThemePreference(),
      commandOpen: false,
      connectionDialogOpen: false,
      editingConnectionId: null,
      saveQueryOpen: false,
      settingsOpen: false,
      fieldPanelOpen: true,
      deleteConnectionId: null,
      setConnection: (id) => set({ connectionId: id, view: 'query' }),
      setIndex: (index) => set({ index, view: 'query' }),
      setView: (view) => set({ view }),
      setTheme: (theme) => set({ theme }),
      setCommandOpen: (open) => set({ commandOpen: open }),
      openConnectionDialog: (connectionId = null) =>
        set({ connectionDialogOpen: true, editingConnectionId: connectionId }),
      closeConnectionDialog: () => set({ connectionDialogOpen: false, editingConnectionId: null }),
      openSaveQuery: () => set({ saveQueryOpen: true }),
      closeSaveQuery: () => set({ saveQueryOpen: false }),
      openSettings: () => set({ settingsOpen: true }),
      closeSettings: () => set({ settingsOpen: false }),
      openDeleteConnection: (id) => set({ deleteConnectionId: id }),
      closeDeleteConnection: () => set({ deleteConnectionId: null }),
      toggleFieldPanel: () => set((state) => ({ fieldPanelOpen: !state.fieldPanelOpen }))
    }),
    {
      name: 'elastic-tool:ui',
      partialize: (state) => ({
        connectionId: state.connectionId,
        index: state.index,
        view: state.view,
        fieldPanelOpen: state.fieldPanelOpen
      })
    }
  )
)
