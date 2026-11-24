/**
 * 复制文本到剪贴板。
 * 优先走主进程 Electron clipboard（不受渲染层焦点与权限影响），
 * 失败时退回 navigator.clipboard 与 document.execCommand。
 */
export async function copyText(text: string): Promise<boolean> {
  if (text.length === 0) return false

  try {
    if (window.api?.clipboard?.writeText) {
      await window.api.clipboard.writeText(text)
      return true
    }
  } catch {
    // 继续尝试浏览器方案
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 继续尝试兜底方案
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(textarea)
    return copied
  } catch {
    return false
  }
}
