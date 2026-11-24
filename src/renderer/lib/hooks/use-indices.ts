import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useIndices(connectionId: string | null) {
  return useQuery({
    queryKey: ['indices', connectionId],
    queryFn: () => api.indices.list(connectionId as string),
    enabled: Boolean(connectionId)
  })
}
