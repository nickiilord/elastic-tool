import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useSaved() {
  return useQuery({
    queryKey: ['saved'],
    queryFn: () => api.saved.list()
  })
}
