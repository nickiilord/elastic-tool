import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import type { QueryOptions, ValidationFix } from '@shared/types'
import { compileQuery } from '@shared/query/compile'
import { buildAggregations, pickAggregationField } from '@shared/query/aggregation'
import { parseDsl } from '@shared/query/parse-dsl'
import { findCondition, updateCondition } from '@shared/query/tree'
import { validateQuery } from '@shared/query/validate'
import { formatCount } from '@shared/format'
import { getOperation } from '@shared/operations'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { EmptyState } from '@/components/common/empty-state'
import { InlineHint } from '@/components/common/inline-hint'
import { useIndices } from '@/lib/hooks/use-indices'
import { useSchema } from '@/lib/hooks/use-schema'
import { useConnections } from '@/lib/hooks/use-connections'
import { useRunner } from '@/lib/hooks/use-runner'
import { useQueryDocument, useQueryStore } from '@/stores/query-store'
import { useUiStore } from '@/stores/ui-store'
import { flattenFields } from '@/features/query-builder/field-picker'
import { BuilderPanel } from '@/features/query-builder/builder-panel'
import { DslEditor } from '@/features/dsl-editor/dsl-editor'
import { RequestBar } from '@/features/request-bar/request-bar'
import { ResultsPanel } from '@/features/results/results-panel'
import { MappingDialog } from '@/features/index-schema/mapping-dialog'

export function QueryWorkspace(): React.JSX.Element {
  const connectionId = useUiStore((state) => state.connectionId)
  const index = useUiStore((state) => state.index)
  const setIndex = useUiStore((state) => state.setIndex)
  const document = useQueryDocument()
  const load = useQueryStore((state) => state.load)
  const update = useQueryStore((state) => state.update)
  const updateTree = useQueryStore((state) => state.updateTree)
  const updateOptions = useQueryStore((state) => state.updateOptions)
  const runner = useRunner()
  const [dslError, setDslError] = useState<string | null>(null)
  const [mappingOpen, setMappingOpen] = useState(false)
  const [builderHeight, setBuilderHeight] = useState(340)
  const splitRef = useRef<HTMLDivElement>(null)

  const { data: connections = [] } = useConnections()
  const { data: schema } = useSchema(connectionId, index)
  const { data: indices = [], isLoading: indicesLoading } = useIndices(connectionId)

  const connection = connections.find((entry) => entry.id === connectionId)
  const indexInfo = indices.find((entry) => entry.name === index)
  const fields = schema?.fields ?? []

  // 切换连接、切换索引或连接配置变化后，旧结果不再对应当前上下文，直接清空
  const resetRunner = runner.reset
  useEffect(() => {
    resetRunner()
  }, [document?.connectionId, document?.index, connection?.url, connection?.readOnly, resetRunner])

  useEffect(() => {
    if (!connectionId || indicesLoading) return
    if (indices.length > 0 && (!index || !indices.some((entry) => entry.name === index))) {
      setIndex(indices[0].name)
      return
    }
    if (index) load(connectionId, index)
  }, [connectionId, index, indices, indicesLoading, load, setIndex])

  const fieldMap = useMemo(
    () =>
      new Map(
        flattenFields(fields).map((field) => [
          field.path,
          {
            type: field.type,
            aggregatable: field.aggregatable,
            keywordSubfield: field.keywordSubfield
          }
        ])
      ),
    [fields]
  )

  const compiled = useMemo(() => {
    if (!document) return null
    return compileQuery(document.tree, {
      fields: fieldMap,
      size: document.options.size,
      trackTotalHits: document.options.trackTotalHits,
      sort: document.options.sort,
      from: document.page * document.options.size
    })
  }, [document, fieldMap])

  const aggregationField = useMemo(
    () =>
      document?.operationId === 'agg'
        ? pickAggregationField(fields, document.options.sort?.field ?? null)
        : null,
    [document?.operationId, document?.options.sort?.field, fields]
  )

  const effectiveDsl = useMemo(() => {
    if (!compiled) return null
    if (document?.operationId !== 'agg') return compiled.dsl
    const dsl: Record<string, unknown> = { ...(compiled.dsl ?? {}), size: 0 }
    const aggregations = buildAggregations(aggregationField)
    if (aggregations) dsl.aggs = aggregations
    return dsl
  }, [compiled, document?.operationId, aggregationField])

  const issues = useMemo(() => {
    if (!document) return []
    return validateQuery(document.tree, {
      fields: fieldMap,
      readOnly: connection?.readOnly ?? false,
      operationId: document.operationId,
      docCount: indexInfo?.docsCount ?? schema?.docCount ?? 0,
      size: document.options.size,
      aggregationField: aggregationField?.path ?? null
    })
  }, [document, fieldMap, connection, schema, aggregationField, indexInfo])

  const blocked = issues.filter((issue) => issue.level === 'block')
  const operation = getOperation(document?.operationId ?? 'search')
  const needsDocId = Boolean(operation?.requiresDocId)
  const docIdReady = !needsDocId || Boolean(document?.docId.trim())
  const dslText =
    document?.mode === 'dsl'
      ? document.dslText
      : effectiveDsl
        ? JSON.stringify(effectiveDsl, null, 2)
        : '{}'
  const canRun = Boolean(
    document &&
      blocked.length === 0 &&
      docIdReady &&
      (document.mode === 'builder' ? effectiveDsl : !dslError)
  )

  const switchMode = useCallback(
    (mode: 'builder' | 'dsl') => {
      if (!document) return
      if (mode === 'dsl') {
        update({
          mode,
          dslText: effectiveDsl ? JSON.stringify(effectiveDsl, null, 2) : document.dslText
        })
        setDslError(null)
        return
      }
      const parsed = parseDsl(document.dslText)
      if (!parsed) {
        setDslError('这段 DSL 无法完整映射为条件树，已保留在 DSL 编辑器里。')
        return
      }
      updateTree(parsed)
      update({ mode })
      setDslError(null)
    },
    [document, effectiveDsl, update, updateTree]
  )

  const run = useCallback(
    (pageOverride?: number) => {
      const doc = useQueryStore.getState().document
      if (!doc) return
      const page = typeof pageOverride === 'number' ? Math.max(0, pageOverride) : doc.page
      const from = page * doc.options.size
      let dsl: Record<string, unknown> | null = null

      if (doc.mode === 'dsl') {
        try {
          const parsed = JSON.parse(doc.dslText) as Record<string, unknown>
          dsl = { ...parsed, from, size: doc.options.size }
          setDslError(null)
        } catch {
          setDslError('DSL 不是合法 JSON，修正后再运行。')
          return
        }
      } else {
        if (blocked.length > 0 || !effectiveDsl) return
        dsl = { ...effectiveDsl, from, size: doc.options.size }
        if (doc.operationId === 'agg') dsl.size = 0
      }

      if (!docIdReady) return

      update({ dirty: false })
      void runner.run({
        connectionId: doc.connectionId,
        index: doc.index,
        operationId: doc.operationId,
        dsl,
        dslText,
        params: needsDocId ? { docId: doc.docId.trim() } : undefined
      })
    },
    [blocked, docIdReady, needsDocId, effectiveDsl, dslText, runner, update]
  )

  const changePage = useCallback(
    (page: number) => {
      const doc = useQueryStore.getState().document
      if (!doc) return
      const next = Math.max(0, page)
      update({ page: next })
      run(next)
    },
    [run, update]
  )

  const handleOptionsChange = useCallback(
    (options: QueryOptions) => {
      const current = useQueryStore.getState().document
      if (!current) return
      const sizeChanged = options.size !== current.options.size
      updateOptions(options)
      const hasResult = runner.result !== null || runner.error !== null
      if (sizeChanged && hasResult) run(0)
    },
    [updateOptions, run, runner.result, runner.error]
  )

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        run()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [run])

  const applyFix = (fix: ValidationFix, conditionId: string): void => {
    if (!document) return
    if (fix.kind === 'change-field' && typeof fix.payload.field === 'string') {
      updateTree(updateCondition(document.tree, conditionId, { field: fix.payload.field }))
      return
    }
    if (fix.kind === 'change-operator' && typeof fix.payload.operator === 'string') {
      updateTree(updateCondition(document.tree, conditionId, { operator: fix.payload.operator }))
      return
    }
    if (fix.kind === 'swap-range') {
      const condition = findCondition(document.tree, conditionId)
      if (condition && condition.value?.kind === 'range') {
        updateTree(
          updateCondition(document.tree, conditionId, {
            value: { kind: 'range', from: condition.value.to, to: condition.value.from }
          })
        )
      }
    }
  }

  const startResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = builderHeight
    const container = splitRef.current
    const maxHeight = container ? Math.max(220, container.clientHeight - 180) : 640

    const onMove = (moveEvent: PointerEvent): void => {
      const next = Math.min(Math.max(160, startHeight + moveEvent.clientY - startY), maxHeight)
      setBuilderHeight(next)
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.document.body.style.cursor = ''
    }
    window.document.body.style.cursor = 'row-resize'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-3 text-xs text-muted-foreground">
        <span className="text-xs font-medium text-foreground">
          {index ?? '未选择索引'}
        </span>
        <span className="h-3.5 w-px bg-border" />
        <span>{indexInfo ? `${formatCount(indexInfo.docsCount)} 文档` : '—'}</span>
        <span className="h-3.5 w-px bg-border" />
        <span>
          {indexInfo ? `${indexInfo.primaryShards} 主分片 / ${indexInfo.replicas} 副本` : '—'}
        </span>
        <span className="h-3.5 w-px bg-border" />
        <span>{flattenFields(fields).length} 字段</span>
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => setMappingOpen(true)}
          disabled={!index}
        >
          浏览 mapping
        </Button>
        <Button size="sm" className="gap-1.5 text-xs active:scale-[0.98]" onClick={() => run()} disabled={!canRun}>
          <Play className="size-3.5" />
          查询此索引
        </Button>
      </div>

      <RequestBar
        mode={document?.mode ?? 'builder'}
        onModeChange={switchMode}
        operationId={document?.operationId ?? 'search'}
        onOperationChange={(operationId) => update({ operationId, docId: '' })}
        index={index}
        connectionId={connectionId}
        dslText={dslText}
        docId={document?.docId ?? ''}
        needsDocId={needsDocId}
        onDocIdChange={(docId) => update({ docId })}
        readOnly={connection?.readOnly ?? false}
        onRun={run}
        running={runner.status === 'running'}
        canRun={canRun}
      />

      {document ? (
        <div ref={splitRef} className="flex min-h-0 flex-1 flex-col">
          <div
            style={{ height: builderHeight }}
            className="flex min-h-0 shrink-0 flex-col overflow-hidden"
          >
            {document.mode === 'builder' ? (
              <BuilderPanel
                document={document}
                fields={fields}
                issues={issues}
                onTreeChange={(tree) => updateTree(tree)}
                onOptionsChange={handleOptionsChange}
                onToggleAggregation={() =>
                  update({
                    operationId: document.operationId === 'agg' ? 'search' : 'agg',
                    page: 0
                  })
                }
                onApplyFix={applyFix}
              />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col animate-in fade-in-0 duration-200">
                {dslError ? (
                  <div className="border-b border-border px-3 py-2">
                    <InlineHint level="warn">{dslError}</InlineHint>
                  </div>
                ) : null}
                <DslEditor
                  value={document.dslText}
                  onChange={(text) => update({ dslText: text, dirty: true })}
                />
              </div>
            )}
          </div>

          <div
            role="separator"
            aria-label="拖动调整构建器与结果区高度"
            onPointerDown={startResize}
            className="group relative h-2 shrink-0 cursor-row-resize border-y border-border bg-muted/30 transition-colors hover:bg-primary/10"
          >
            <span className="absolute left-1/2 top-1/2 h-0.5 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border transition-colors group-hover:bg-primary/60" />
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <ResultsPanel
              status={runner.status}
              result={runner.result}
              error={runner.error}
              tab={document.resultTab}
              onTabChange={(resultTab) => update({ resultTab })}
              paginated={document.operationId === 'search'}
              page={document.page}
              pageSize={document.options.size}
              onPageChange={changePage}
            />
          </div>
        </div>
      ) : (
        <EmptyState
          title="从左侧选一个索引开始"
          description="选中索引后，字段面板会从 mapping 加载可用字段。构建器与 DSL 编辑器共用同一份查询，切换索引会保留各自的草稿。"
        >
          <span className="text-xs text-muted-foreground">
            快捷键 <Kbd>Ctrl K</Kbd> 打开命令面板
          </span>
        </EmptyState>
      )}

      <MappingDialog
        open={mappingOpen}
        onOpenChange={setMappingOpen}
        index={index}
        mapping={schema?.mappingRaw}
      />
    </main>
  )
}
