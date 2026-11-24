import type { ReactNode } from 'react'

export function EmptyState({
  title,
  description,
  children
}: {
  title: string
  description?: ReactNode
  children?: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <div className="max-w-md text-xs leading-6 text-muted-foreground">{description}</div>
      ) : null}
      {children ? <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{children}</div> : null}
    </div>
  )
}
