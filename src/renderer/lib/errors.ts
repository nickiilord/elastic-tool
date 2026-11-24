export interface FriendlyError {
  title: string
  detail?: string
}

/**
 * 把主进程返回的底层错误（OpenSSL、socket errno 等）翻译成一句可读的提示，
 * 原始信息保留在 detail 里供展开查看。
 */
export function friendlyConnectionError(message: string): FriendlyError {
  const raw = message.trim()
  const lower = raw.toLowerCase()

  if (lower.includes('wrong_version_number') || lower.includes('eproto')) {
    return {
      title: 'TLS 握手失败：这个地址可能不是 HTTPS 端口',
      detail: `${raw}\n\n提示：9200 端口通常用 http://；如果集群没开 TLS，把地址改成 http:// 再试。`
    }
  }
  if (lower.includes('econnrefused')) {
    return { title: '无法连接：端口未开放或服务未启动', detail: raw }
  }
  if (lower.includes('enotfound') || lower.includes('eai_again')) {
    return { title: '域名解析失败，检查主机名或 DNS', detail: raw }
  }
  if (lower.includes('etimedout') || lower.includes('timeout') || lower.includes('超时')) {
    return { title: '连接超时，检查网络、端口与防火墙', detail: raw }
  }
  if (
    lower.includes('self signed') ||
    lower.includes('certificate') ||
    lower.includes('unable to verify')
  ) {
    return { title: '证书校验失败，可尝试开启「跳过证书校验」', detail: raw }
  }
  if (lower.includes('unauthorized') || lower.includes('401')) {
    return { title: '认证失败，检查用户名与密码', detail: raw }
  }
  if (lower.includes('forbidden') || lower.includes('403')) {
    return { title: '权限不足，检查账号权限', detail: raw }
  }
  if (lower.includes('401') || lower.includes('auth')) {
    return { title: '认证失败，检查连接凭证', detail: raw }
  }
  return { title: raw.length > 120 ? `${raw.slice(0, 120)}…` : raw, detail: raw }
}
