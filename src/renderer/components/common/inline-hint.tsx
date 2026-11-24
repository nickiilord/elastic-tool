import type { ReactNode } from 'react'
import { AlertCircle, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function InlineHint({
  level,
  children,
  action
}: {
  level: 'block' | 'warn'
  children: ReactNode
  action?: ReactNode
}): React.JSX.Element {
  const Icon = level === 'block' ? AlertCircle : AlertTriangle
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md px-2 py-1.5 text-xs leading-5',
        level === 'block'
          ? 'bg-destructive/10 text-destructive'
          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  )
}
