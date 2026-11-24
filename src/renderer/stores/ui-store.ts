import { create } from 'zustand'
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

export const useUiStore = create<UiState>((set) => ({
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
}))
