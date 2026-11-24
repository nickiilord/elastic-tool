import { useEffect, useState } from 'react'
import type { Metrics } from '@shared/types'
import { api } from '@/lib/api'

export function useMetrics(): Metrics | null {
  const [metrics, setMetrics] = useState<Metrics | null>(null)

  useEffect(() => {
    const unsubscribe = api.app.onMetrics(setMetrics)
    return unsubscribe
  }, [])

  return metrics
}
