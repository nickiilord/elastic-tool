import { fieldTypeGroup } from '@shared/query/operators'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const TYPE_TONE: Record<string, string> = {
  keyword: 'bg-muted text-muted-foreground',
  text: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  number: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  date: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  boolean: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  ip: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
  geo: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  object: 'bg-muted text-muted-foreground',
  unknown: 'bg-muted text-muted-foreground'
}

export function TypeBadge({
  type,
  className
}: {
  type: string
  className?: string
}): React.JSX.Element {
  return (
    <Badge
      variant="secondary"
      className={cn(
        'h-5 shrink-0 rounded-md border-0 px-1.5 text-xs font-normal',
        TYPE_TONE[fieldTypeGroup(type)] ?? 'bg-muted text-muted-foreground',
        className
      )}
    >
      {type}
    </Badge>
  )
}
