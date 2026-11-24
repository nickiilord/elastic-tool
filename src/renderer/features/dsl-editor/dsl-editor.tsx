import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, highlightActiveLine, lineNumbers } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { json } from '@codemirror/lang-json'
import { tags } from '@lezer/highlight'

// light-dark() 跟随 color-scheme 自动切换，无需在 JS 里监听主题
const highlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: 'light-dark(#2563eb, #60a5fa)' },
  { tag: tags.string, color: 'light-dark(#15803d, #4ade80)' },
  { tag: tags.number, color: 'light-dark(#b45309, #fbbf24)' },
  { tag: [tags.bool, tags.null], color: 'light-dark(#7c3aed, #a78bfa)' },
  { tag: tags.punctuation, color: 'light-dark(#71717a, #a1a1aa)' }
])

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
    fontSize: '13px'
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '22px'
  },
  '.cm-content': {
    padding: '8px 0',
    caretColor: 'var(--foreground)'
  },
  '.cm-line': {
    padding: '0 12px'
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    borderRight: '1px solid var(--border)',
    color: 'var(--muted-foreground)',
    minWidth: '40px'
  },
  '.cm-gutterElement': {
    padding: '0 10px 0 8px',
    minWidth: '40px',
    textAlign: 'right'
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in oklab, var(--muted) 60%, transparent)'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: 'var(--foreground)'
  },
  '&.cm-focused': {
    outline: 'none'
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--foreground)'
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in oklab, var(--primary) 18%, transparent)'
  }
})

export function DslEditor({
  value,
  onChange
}: {
  value: string
  onChange: (text: string) => void
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          json(),
          syntaxHighlighting(highlightStyle),
          editorTheme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          })
        ]
      })
    })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // 初始化一次，后续内容变化走下面的同步 effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
  }, [value])

  return <div ref={containerRef} className="h-full min-h-0 overflow-auto" />
}
