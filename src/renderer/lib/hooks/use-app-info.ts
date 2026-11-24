import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useAppInfo() {
  return useQuery({
    queryKey: ['app-info'],
    queryFn: () => api.app.info(),
    staleTime: Infinity
  })
}
