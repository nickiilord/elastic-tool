import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ConnectionInput } from '@shared/types'
import { api } from '@/lib/api'

export function useConnections() {
  return useQuery({
    queryKey: ['connections'],
    queryFn: () => api.connections.list()
  })
}

export function useSaveConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ConnectionInput) => api.connections.save(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['connections'] })
    }
  })
}

export function useTestConnection() {
  return useMutation({
    mutationFn: (id: string) => api.connections.test(id)
  })
}

export function useRemoveConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.connections.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['connections'] })
    }
  })
}
