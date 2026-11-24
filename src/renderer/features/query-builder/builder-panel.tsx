import { useState } from 'react'
import { AlertCircle, AlertTriangle, ChevronDown, FolderPlus, ListFilter, Plus, Trash2 } from 'lucide-react'
import type {
  FieldSchema,
  QueryCondition,
  QueryDocument,
  QueryGroup,
  QueryOptions,
  QueryTree,
  ValidationFix,
  ValidationIssue
} from '@shared/types'
import { countConditions, createCondition } from '@shared/query/tree'
import { cn, toggleActiveClass } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ConditionRow } from './condition-row'

export interface BuilderPanelProps {
  document: QueryDocument
  fields: FieldSchema[]
  issues: ValidationIssue[]
  onTreeChange: (tree: QueryTree) => void
  onOptionsChange: (options: QueryOptions) => void
  onToggleAggregation: () => void
  onApplyFix: (fix: ValidationFix, conditionId: string) => void
}

const NO_SORT = '__none__'

export function BuilderPanel({
  document,
  fields,
  issues,
  onTreeChange,
  onOptionsChange,
  onToggleAggregation,
  onApplyFix
}: BuilderPanelProps): React.JSX.Element {
  const tree = document.tree
  const { total, incomplete } = countConditions(tree)
  const nestedGroups = tree.root.children.filter((child) => child.kind === 'group').length
  const blocked = issues.filter((issue) => issue.level === 'block')
  const warned = issues.filter((issue) => issue.level === 'warn')

  const updateCondition = (condition: QueryCondition, patch: Partial<QueryCondition>): void => {
    onTreeChange(patchCondition(tree, condition.id, patch))
  }

  const removeCondition = (condition: QueryCondition): void => {
    const onlyRootCondition =
      tree.root.children.length === 1 &&
      tree.root.children[0].kind === 'condition' &&
      tree.root.children[0].id === condition.id &&
      tree.exclusion.children.length === 0
    if (onlyRootCondition) {
      updateCondition(condition, { field: null, operator: null, value: null })
      return
    }
    onTreeChange(removeFromTree(tree, condition.id))
  }

  const duplicateCondition = (condition: QueryCondition): void => {
    const copy: QueryCondition = {
      ...condition,
      id: createCondition(null, null, null).id
    }
    onTreeChange({
      ...tree,
      root: { ...tree.root, children: [...tree.root.children, copy] }
    })
  }

  const addCondition = (): void => {
    onTreeChange({
      ...tree,
      root: { ...tree.root, children: [...tree.root.children, createCondition(null, null, null)] }
    })
  }

  const addGroup = (): void => {
    onTreeChange({
      ...tree,
      root: {
        ...tree.root,
        children: [
          ...tree.root.children,
          { kind: 'group', id: createCondition(null, null, null).id, logic: 'any', children: [] }
        ]
      }
    })
  }

  const addExclusion = (): void => {
    onTreeChange({
      ...tree,
      exclusion: {
        ...tree.exclusion,
        children: [...tree.exclusion.children, createCondition(null, null, null)]
      }
    })
  }

  const sortableFields = fields.filter((field) => !field.children && field.aggregatable)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 条件逻辑与操作 */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={tree.root.logic}
          onValueChange={(next) =>
            next && onTreeChange({ ...tree, root: { ...tree.root, logic: next === 'any' ? 'any' : 'all' } })
          }
        >
          <ToggleGroupItem value="all" className={cn('px-2.5 text-xs', toggleActiveClass)}>
            全部满足
          </ToggleGroupItem>
          <ToggleGroupItem value="any" className={cn('px-2.5 text-xs', toggleActiveClass)}>
            任一满足
          </ToggleGroupItem>
        </ToggleGroup>
        <Badge variant="outline" className="text-xs font-normal">
          {tree.root.logic === 'all' ? 'AND' : 'OR'}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {total} 条
          {nestedGroups > 0 ? ` · ${nestedGroups} 个子组` : ''}
          {incomplete > 0 ? ` · ${incomplete} 条未完成` : ''}
        </span>
        <span className="flex-1" />
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={addCondition}>
          <Plus className="size-3.5" />
          条件
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={addGroup}>
          <FolderPlus className="size-3.5" />
          分组
        </Button>
      </div>

      {/* 条件列表 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-muted/40 p-3">
        {tree.root.children.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex w-full max-w-md animate-in fade-in-0 flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-8 text-center duration-200">
              <span className="flex size-10 items-center justify-center rounded-full bg-muted">
                <ListFilter className="size-5 text-muted-foreground" />
              </span>
              <div>
                <p className="text-sm font-medium">这个查询还没有条件</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  在右侧「字段」里点任意字段加一条条件，字段与操作符都来自当前索引的 mapping。
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {tree.root.children.map((child) =>
              child.kind === 'condition' ? (
                <ConditionRow
                  key={child.id}
                  condition={child}
                  fields={fields}
                  invalid={isConditionInvalid(child.id, issues)}
                  onChange={(patch) => updateCondition(child, patch)}
                  onRemove={() => removeCondition(child)}
                  onDuplicate={() => duplicateCondition(child)}
                />
              ) : (
                <NestedGroup
                  key={child.id}
                  group={child}
                  tree={tree}
                  fields={fields}
                  issues={issues}
                  onTreeChange={onTreeChange}
                  onApplyFix={onApplyFix}
                />
              )
            )}
          </div>
        )}

        {tree.exclusion.children.length > 0 ? (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2 animate-in fade-in-0 slide-in-from-top-1 duration-150">
            <div className="flex h-7 items-center gap-2 px-1">
              <span className="size-1.5 rounded-full bg-destructive" />
              <span className="text-xs font-medium">排除条件</span>
              <Badge variant="outline" className="text-xs font-normal">
                NOT
              </Badge>
              <span className="text-xs text-muted-foreground">
                {tree.exclusion.children.length} 条 · 从命中结果中剔除
              </span>
            </div>
            <div className="space-y-1.5">
              {tree.exclusion.children.map((condition) => (
                <ConditionRow
                  key={condition.id}
                  condition={condition}
                  fields={fields}
                  onChange={(patch) =>
                    onTreeChange({
                      ...tree,
                      exclusion: {
                        ...tree.exclusion,
                        children: tree.exclusion.children.map((entry) =>
                          entry.id === condition.id ? { ...entry, ...patch } : entry
                        )
                      }
                    })
                  }
                  onRemove={() =>
                    onTreeChange({
                      ...tree,
                      exclusion: {
                        ...tree.exclusion,
                        children: tree.exclusion.children.filter((entry) => entry.id !== condition.id)
                      }
                    })
                  }
                  onDuplicate={() => {
                    const copy = { ...condition, id: createCondition(null, null, null).id }
                    onTreeChange({
                      ...tree,
                      exclusion: { ...tree.exclusion, children: [...tree.exclusion.children, copy] }
                    })
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}

        {tree.root.children.length > 0 ? (
          <Button
            variant="ghost"
            size="xs"
            className="mt-2 self-start gap-1 text-muted-foreground"
            onClick={addExclusion}
          >
            <Plus className="size-3.5" />
            排除条件
          </Button>
        ) : null}
      </div>

      {/* 查询选项 */}
      <div className="flex h-10 shrink-0 items-center gap-3 border-t border-border px-3">
        <span className="shrink-0 text-xs text-muted-foreground">排序</span>
        <Select
          value={document.options.sort?.field ?? NO_SORT}
          onValueChange={(next) =>
            onOptionsChange({
              ...document.options,
              sort:
                next === NO_SORT
                  ? null
                  : { field: next, order: document.options.sort?.order ?? 'desc' }
            })
          }
        >
          <SelectTrigger size="sm" className="h-8 w-44 text-xs">
            <SelectValue placeholder="不排序" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_SORT} className="text-xs">
              不排序
            </SelectItem>
            {sortableFields.map((field) => (
              <SelectItem key={field.path} value={field.path} className="text-xs">
                {field.path}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={document.options.sort?.order ?? 'desc'}
          onValueChange={(order) => {
            if (!order) return
            const field = document.options.sort?.field ?? sortableFields[0]?.path
            if (!field) return
            onOptionsChange({
              ...document.options,
              sort: { field, order: order === 'asc' ? 'asc' : 'desc' }
            })
          }}
        >
          <ToggleGroupItem value="desc" className={cn('px-2.5 text-xs', toggleActiveClass)}>
            降序
          </ToggleGroupItem>
          <ToggleGroupItem value="asc" className={cn('px-2.5 text-xs', toggleActiveClass)}>
            升序
          </ToggleGroupItem>
        </ToggleGroup>

        <Separator orientation="vertical" className="h-5" />

        <span className="shrink-0 text-xs text-muted-foreground">每页</span>
        <Select
          value={String(document.options.size)}
          onValueChange={(next) => onOptionsChange({ ...document.options, size: Number(next) })}
        >
          <SelectTrigger size="sm" className="h-8 w-20 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[20, 50, 100].map((size) => (
              <SelectItem key={size} value={String(size)} className="text-xs">
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="flex-1" />

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          聚合统计
          <Switch
            checked={document.operationId === 'agg'}
            onCheckedChange={() => onToggleAggregation()}
            aria-label="聚合统计"
          />
        </label>
      </div>

      {blocked.length > 0 || warned.length > 0 ? (
        <ProblemsPanel
          issues={issues}
          passed={Math.max(0, total - blocked.length - warned.length)}
          onApplyFix={onApplyFix}
        />
      ) : null}
    </div>
  )
}

function isConditionInvalid(conditionId: string, issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.conditionId === conditionId && issue.level === 'block')
}

function patchCondition(
  tree: QueryTree,
  conditionId: string,
  patch: Partial<QueryCondition>
): QueryTree {
  const walk = (group: QueryGroup): QueryGroup => ({
    ...group,
    children: group.children.map((child) => {
      if (child.kind === 'condition') {
        return child.id === conditionId ? { ...child, ...patch } : child
      }
      return walk(child)
    })
  })
  return {
    root: walk(tree.root),
    exclusion: {
      ...tree.exclusion,
      children: tree.exclusion.children.map((condition) =>
        condition.id === conditionId ? { ...condition, ...patch } : condition
      )
    }
  }
}

function removeFromTree(tree: QueryTree, conditionId: string): QueryTree {
  const walk = (group: QueryGroup): QueryGroup => ({
    ...group,
    children: group.children
      .filter((child) => !(child.kind === 'condition' && child.id === conditionId))
      .map((child) => (child.kind === 'group' ? walk(child) : child))
  })
  return {
    root: walk(tree.root),
    exclusion: {
      ...tree.exclusion,
      children: tree.exclusion.children.filter((condition) => condition.id !== conditionId)
    }
  }
}

function NestedGroup({
  group,
  tree,
  fields,
  issues,
  onTreeChange,
  onApplyFix
}: {
  group: QueryGroup
  tree: QueryTree
  fields: FieldSchema[]
  issues: ValidationIssue[]
  onTreeChange: (tree: QueryTree) => void
  onApplyFix: (fix: ValidationFix, conditionId: string) => void
}): React.JSX.Element {
  const conditionCount = group.children.filter((child) => child.kind === 'condition').length

  const updateGroup = (next: QueryGroup): void => {
    const walk = (current: QueryGroup): QueryGroup => ({
      ...current,
      children: current.children.map((child) => {
        if (child.kind !== 'group') return child
        return child.id === group.id ? next : walk(child)
      })
    })
    onTreeChange({ ...tree, root: walk(tree.root) })
  }

  const removeGroup = (): void => {
    const walk = (current: QueryGroup): QueryGroup => ({
      ...current,
      children: current.children
        .filter((child) => !(child.kind === 'group' && child.id === group.id))
        .map((child) => (child.kind === 'group' ? walk(child) : child))
    })
    onTreeChange({ ...tree, root: walk(tree.root) })
  }

  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <div className="flex h-8 items-center gap-2 px-0.5">
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          aria-label={group.collapsed ? '展开分组' : '折叠分组'}
          onClick={() => updateGroup({ ...group, collapsed: !group.collapsed })}
        >
          <ChevronDown
            className={cn('size-3.5 transition-transform duration-200', group.collapsed && '-rotate-90')}
          />
        </Button>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={group.logic}
          onValueChange={(next) =>
            next && updateGroup({ ...group, logic: next === 'all' ? 'all' : 'any' })
          }
        >
          <ToggleGroupItem value="any" className={cn('px-2 text-xs', toggleActiveClass)}>
            任一满足
          </ToggleGroupItem>
          <ToggleGroupItem value="all" className={cn('px-2 text-xs', toggleActiveClass)}>
            全部满足
          </ToggleGroupItem>
        </ToggleGroup>
        <Badge variant="outline" className="text-xs font-normal">
          {group.logic === 'all' ? 'AND' : 'OR'}
        </Badge>
        <span className="text-xs text-muted-foreground">{conditionCount} 条</span>
        <span className="flex-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-destructive"
              aria-label="删除分组"
              onClick={removeGroup}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>删除分组</TooltipContent>
        </Tooltip>
      </div>

      {group.collapsed ? null : (
        <div className="mt-1 space-y-1.5 animate-in fade-in-0 slide-in-from-top-1 duration-150">
          {group.children.map((child) =>
            child.kind === 'condition' ? (
              <ConditionRow
                key={child.id}
                condition={child}
                fields={fields}
                invalid={isConditionInvalid(child.id, issues)}
                onChange={(patch) =>
                  updateGroup({
                    ...group,
                    children: group.children.map((entry) =>
                      entry.kind === 'condition' && entry.id === child.id
                        ? { ...entry, ...patch }
                        : entry
                    )
                  })
                }
                onRemove={() =>
                  updateGroup({
                    ...group,
                    children: group.children.filter((entry) => entry.id !== child.id)
                  })
                }
                onDuplicate={() =>
                  updateGroup({
                    ...group,
                    children: [
                      ...group.children,
                      { ...child, id: createCondition(null, null, null).id }
                    ]
                  })
                }
              />
            ) : null
          )}
          <Button
            variant="ghost"
            size="xs"
            className="ml-0.5 gap-1 text-muted-foreground"
            onClick={() =>
              updateGroup({
                ...group,
                children: [...group.children, createCondition(null, null, null)]
              })
            }
          >
            <Plus className="size-3.5" />
            组内条件
          </Button>
        </div>
      )}
    </div>
  )
}

function ProblemsPanel({
  issues,
  passed,
  onApplyFix
}: {
  issues: ValidationIssue[]
  passed: number
  onApplyFix: (fix: ValidationFix, conditionId: string) => void
}): React.JSX.Element {
  const blocked = issues.filter((issue) => issue.level === 'block')
  const warned = issues.filter((issue) => issue.level === 'warn')
  const visible = [...blocked, ...warned].slice(0, 4)

  return (
    <div className="shrink-0 border-t border-border bg-destructive/5 px-3 py-2 animate-in fade-in-0 slide-in-from-bottom-1 duration-150">
      <div className="flex items-center gap-3 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-destructive">
          <AlertCircle className="size-3.5" />
          {blocked.length} 条阻断
        </span>
        {warned.length > 0 ? (
          <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-3.5" />
            {warned.length} 条预警
          </span>
        ) : null}
        <span className="text-muted-foreground">{passed} 条通过 · 修复阻断项后才能运行</span>
        <span className="flex-1" />
        <span className="text-xs text-muted-foreground">DSL 生成已暂停</span>
      </div>
      <div className="mt-1.5 space-y-1">
        {visible.map((issue) => (
          <div
            key={issue.id}
            className="flex items-center gap-2 rounded-md border border-border bg-background/80 px-2 py-1"
          >
            {issue.level === 'block' ? (
              <AlertCircle className="size-3.5 shrink-0 text-destructive" />
            ) : (
              <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
            )}
            <span className="w-36 shrink-0 truncate text-xs">{issue.field}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {issue.message}
            </span>
            {issue.estimate ? (
              <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">
                {issue.estimate}
              </span>
            ) : null}
            <Badge variant="outline" className="shrink-0 text-xs font-normal">
              {issue.meta}
            </Badge>
            {issue.fix ? (
              <Button
                variant="outline"
                size="xs"
                className="shrink-0"
                onClick={() => onApplyFix(issue.fix as ValidationFix, issue.conditionId)}
              >
                {issue.fix.label}
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
