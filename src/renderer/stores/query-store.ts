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
    page: 0
  }
}

function draftKey(connectionId: string, index: string | null): string {
  return `${connectionId}::${index ?? ''}`
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

export const useQueryStore = create<QueryState>((set, get) => ({
  document: null,
  drafts: {},

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
