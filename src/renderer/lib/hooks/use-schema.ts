import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useSchema(connectionId: string | null, index: string | null) {
  return useQuery({
    queryKey: ['schema', connectionId, index],
    queryFn: () => api.indices.schema(connectionId as string, index as string),
    enabled: Boolean(connectionId && index)
  })
}
