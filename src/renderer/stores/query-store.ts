import { create } from 'zustand'
import { createId } from '@shared/id'
import type { QueryDocument, QueryOptions, QueryTree } from '@shared/types'

export function emptyTree(): QueryTree {
  return {
    root: { kind: 'group', id: createId('g'), logic: 'all', children: [] },
    exclusion: { kind: 'exclusion', id: createId('x'), children: [] }
  }
}

export const defaultOptions: QueryOptions = {
  size: 20,
  trackTotalHits: true,
  sort: null
}

const STORAGE_KEY = 'elastic-tool:query'

function createDocument(connectionId: string, index: string, title?: string): QueryDocument {
  return {
    id: createId('doc'),
    title: title ?? `${index} · 查询`,
    connectionId,
    index,
    mode: 'builder',
    operationId: 'search',
    tree: emptyTree(),
    options: { ...defaultOptions },
    dslText: '{}',
    dirty: false,
    resultTab: 'table',
    page: 0,
    docId: ''
  }
}

function draftKey(connectionId: string, index: string | null): string {
  return `${connectionId}::${index ?? ''}`
}

function isQueryDocument(value: unknown): value is QueryDocument {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<QueryDocument>
  return Boolean(candidate.id && candidate.connectionId && candidate.tree && candidate.options)
}

interface PersistedQueryState {
  document: QueryDocument | null
  drafts: Record<string, QueryDocument>
}

function readPersistedState(): PersistedQueryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { document: null, drafts: {} }
    const parsed = JSON.parse(raw) as Partial<PersistedQueryState>
    const document = isQueryDocument(parsed.document) ? parsed.document : null
    const drafts: Record<string, QueryDocument> = {}
    if (parsed.drafts && typeof parsed.drafts === 'object') {
      for (const [key, value] of Object.entries(parsed.drafts)) {
        if (isQueryDocument(value)) drafts[key] = value
      }
    }
    return { document, drafts }
  } catch {
    return { document: null, drafts: {} }
  }
}

interface QueryState {
  document: QueryDocument | null
  /** 按连接与索引缓存的草稿，切回同一个索引时恢复上次的条件与选项。 */
  drafts: Record<string, QueryDocument>
  load: (connectionId: string, index: string) => void
  update: (patch: Partial<QueryDocument>) => void
  updateTree: (tree: QueryTree) => void
  updateOptions: (options: QueryOptions) => void
  reset: () => void
}

const persisted = readPersistedState()

export const useQueryStore = create<QueryState>((set, get) => ({
  document: persisted.document,
  drafts: persisted.drafts,

  load: (connectionId, index) => {
    const state = get()
    const current = state.document
    if (current && current.connectionId === connectionId && current.index === index) return

    const drafts = { ...state.drafts }
    if (current) {
      drafts[draftKey(current.connectionId, current.index)] = current
    }

    const cached = drafts[draftKey(connectionId, index)]
    set({
      document: cached ? { ...cached, page: 0 } : createDocument(connectionId, index),
      drafts
    })
  },

  update: (patch) => {
    const current = get().document
    if (!current) return
    const next = { ...current, ...patch }
    set((state) => ({
      document: next,
      drafts: { ...state.drafts, [draftKey(next.connectionId, next.index)]: next }
    }))
  },

  updateTree: (tree) => {
    const current = get().document
    if (!current) return
    // 过滤条件变化后结果页会变，回到第一页
    const next = { ...current, tree, dirty: true, page: 0 }
    set((state) => ({
      document: next,
      drafts: { ...state.drafts, [draftKey(next.connectionId, next.index)]: next }
    }))
  },

  updateOptions: (options) => {
    const current = get().document
    if (!current) return
    const sizeChanged = options.size !== current.options.size
    const next = { ...current, options, dirty: true, page: sizeChanged ? 0 : current.page }
    set((state) => ({
      document: next,
      drafts: { ...state.drafts, [draftKey(next.connectionId, next.index)]: next }
    }))
  },

  reset: () => set({ document: null, drafts: {} })
}))

export function useQueryDocument(): QueryDocument | null {
  return useQueryStore((state) => state.document)
}

// 查询草稿写回 localStorage：编辑时每次按键都会更新状态，用防抖减少写入。
let saveTimer: ReturnType<typeof setTimeout> | null = null
useQueryStore.subscribe((state) => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ document: state.document, drafts: state.drafts })
      )
    } catch {
      // 写入失败（配额或隐私模式）时忽略，不影响本次会话
    }
  }, 400)
})
