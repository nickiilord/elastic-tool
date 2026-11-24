import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useHistory(connectionId: string | null) {
  return useQuery({
    queryKey: ['history', connectionId],
    queryFn: () => api.history.list(connectionId ?? undefined),
    enabled: Boolean(connectionId)
  })
}
