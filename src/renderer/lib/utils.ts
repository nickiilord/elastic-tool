import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * ToggleGroup 选中项的统一样式。
 * shadcn 默认选中态是浅灰底，浅色主题下几乎看不出，这里统一换成高对比的主色底。
 */
export const toggleActiveClass =
  'data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground'
