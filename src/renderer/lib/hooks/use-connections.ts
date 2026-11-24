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
    onSuccess: (summary) => {
      void queryClient.invalidateQueries({ queryKey: ['connections'] })
      void queryClient.invalidateQueries({ queryKey: ['connection-detail', summary.id] })
      void queryClient.invalidateQueries({ queryKey: ['connection-status', summary.id] })
      // 地址、认证、TLS 或只读设置可能变了，索引、mapping 与诊断数据都需要重新拉取
      void queryClient.invalidateQueries({ queryKey: ['indices'] })
      void queryClient.invalidateQueries({ queryKey: ['schema'] })
      void queryClient.invalidateQueries({ queryKey: ['diagnostics'] })
    }
  })
}

export function useConnectionDetail(connectionId: string | null) {
  return useQuery({
    queryKey: ['connection-detail', connectionId],
    queryFn: () => api.connections.detail(connectionId as string),
    enabled: Boolean(connectionId),
    staleTime: 0
  })
}

export function useTestConnection() {
  return useMutation({
    mutationFn: (id: string) => api.connections.test(id)
  })
}

/** 连接状态探测：启动与切换连接时各探测一次，60 秒内复用结果；探测失败时每 30 秒自动重试。 */
export function useConnectionStatus(connectionId: string | null) {
  return useQuery({
    queryKey: ['connection-status', connectionId],
    queryFn: () => api.connections.test(connectionId as string),
    enabled: Boolean(connectionId),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => (query.state.data && !query.state.data.ok ? 30_000 : false)
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
