import { useCallback, useRef, useState } from 'react'
import type { EsErrorPayload, EsRunRequest, EsRunResult } from '@shared/types'
import { createId } from '@shared/id'
import { api } from '@/lib/api'

export interface RunnerState {
  status: 'idle' | 'running' | 'done' | 'error'
  result: EsRunResult | null
  error: EsErrorPayload | null
  requestId: string | null
}

export interface RunInput {
  connectionId: string
  index: string | null
  operationId: string
  dsl: Record<string, unknown> | null
  dslText?: string
  params?: Record<string, string>
}

function toErrorPayload(error: unknown): EsErrorPayload {
  if (error instanceof Error) {
    const candidate = error as Error & Partial<EsErrorPayload>
    return {
      code: candidate.code ?? 'network',
      message: error.message,
      status: candidate.status,
      body: candidate.body
    }
  }
  return { code: 'network', message: '请求失败' }
}

export function useRunner(): RunnerState & {
  run: (input: RunInput) => Promise<void>
  cancel: () => void
  reset: () => void
} {
  const [state, setState] = useState<RunnerState>({
    status: 'idle',
    result: null,
    error: null,
    requestId: null
  })
  const activeId = useRef<string | null>(null)

  const run = useCallback(async (input: RunInput) => {
    const requestId = createId('req')
    activeId.current = requestId
    setState({ status: 'running', result: null, error: null, requestId })

    const request: EsRunRequest = {
      connectionId: input.connectionId,
      index: input.index,
      operationId: input.operationId,
      dsl: input.dsl,
      dslText: input.dslText,
      requestId,
      params: input.params
    }

    try {
      const result = await api.es.run(request)
      if (activeId.current !== requestId) return
      setState({ status: 'done', result, error: null, requestId })
    } catch (error) {
      if (activeId.current !== requestId) return
      setState({ status: 'error', result: null, error: toErrorPayload(error), requestId })
    }
  }, [])

  const cancel = useCallback(() => {
    const requestId = activeId.current
    if (!requestId) return
    void api.es.cancel(requestId)
    activeId.current = null
    setState((previous) => ({ ...previous, status: 'idle', requestId: null }))
  }, [])

  /** 切换连接、索引或连接配置变化时清空结果，避免展示上一份查询的数据。 */
  const reset = useCallback(() => {
    activeId.current = null
    setState({ status: 'idle', result: null, error: null, requestId: null })
  }, [])

  return { ...state, run, cancel, reset }
}
