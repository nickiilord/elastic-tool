import type { ConditionValue, GroupLogic, QueryCondition, QueryGroup, QueryTree } from '../types'
import { createId } from '../id'

export function createCondition(
  field: string | null,
  operator: string | null,
  value: ConditionValue | null
): QueryCondition {
  return { kind: 'condition', id: createId('c'), field, operator, value }
}

export function appendCondition(
  tree: QueryTree,
  condition: QueryCondition,
  groupId: string = tree.root.id
): QueryTree {
  const walk = (group: QueryGroup): QueryGroup => ({
    ...group,
    children: group.children.map((child) =>
      child.kind === 'group' ? walk(child) : child
    )
  })
  const insert = (group: QueryGroup): QueryGroup => {
    if (group.id === groupId) {
      return { ...group, children: [...group.children, condition] }
    }
    return {
      ...group,
      children: group.children.map((child) => (child.kind === 'group' ? insert(child) : child))
    }
  }
  void walk
  return { ...tree, root: insert(tree.root) }
}

export function removeCondition(tree: QueryTree, conditionId: string): QueryTree {
  const removeFromGroup = (group: QueryGroup): QueryGroup => ({
    ...group,
    children: group.children
      .filter((child) => !(child.kind === 'condition' && child.id === conditionId))
      .map((child) => (child.kind === 'group' ? removeFromGroup(child) : child))
  })
  return {
    root: removeFromGroup(tree.root),
    exclusion: {
      ...tree.exclusion,
      children: tree.exclusion.children.filter((condition) => condition.id !== conditionId)
    }
  }
}

export function updateCondition(
  tree: QueryTree,
  conditionId: string,
  patch: Partial<QueryCondition>
): QueryTree {
  const patchGroup = (group: QueryGroup): QueryGroup => ({
    ...group,
    children: group.children.map((child) => {
      if (child.kind === 'condition') {
        return child.id === conditionId ? { ...child, ...patch } : child
      }
      return patchGroup(child)
    })
  })
  return {
    root: patchGroup(tree.root),
    exclusion: {
      ...tree.exclusion,
      children: tree.exclusion.children.map((condition) =>
        condition.id === conditionId ? { ...condition, ...patch } : condition
      )
    }
  }
}

export function addGroup(tree: QueryTree): QueryTree {
  const group: QueryGroup = {
    kind: 'group',
    id: createId('g'),
    logic: 'any',
    children: []
  }
  return {
    ...tree,
    root: { ...tree.root, children: [...tree.root.children, group] }
  }
}

export function updateGroupLogic(tree: QueryTree, groupId: string, logic: GroupLogic): QueryTree {
  const update = (group: QueryGroup): QueryGroup => ({
    ...group,
    logic: group.id === groupId ? logic : group.logic,
    children: group.children.map((child) => (child.kind === 'group' ? update(child) : child))
  })
  return { ...tree, root: update(tree.root) }
}

export function toggleGroupCollapsed(tree: QueryTree, groupId: string): QueryTree {
  const update = (group: QueryGroup): QueryGroup => ({
    ...group,
    collapsed: group.id === groupId ? !group.collapsed : group.collapsed,
    children: group.children.map((child) => (child.kind === 'group' ? update(child) : child))
  })
  return { ...tree, root: update(tree.root) }
}

export function addExclusionCondition(tree: QueryTree, condition: QueryCondition): QueryTree {
  return {
    ...tree,
    exclusion: { ...tree.exclusion, children: [...tree.exclusion.children, condition] }
  }
}

export function findCondition(tree: QueryTree, conditionId: string): QueryCondition | null {
  const visit = (group: QueryGroup): QueryCondition | null => {
    for (const child of group.children) {
      if (child.kind === 'condition') {
        if (child.id === conditionId) return child
        continue
      }
      const found = visit(child)
      if (found) return found
    }
    return null
  }
  return (
    visit(tree.root) ??
    tree.exclusion.children.find((condition) => condition.id === conditionId) ??
    null
  )
}

export function countConditions(tree: QueryTree): { total: number; incomplete: number } {  const count = (group: QueryGroup): { total: number; incomplete: number } => {
    let total = 0
    let incomplete = 0
    for (const child of group.children) {
      if (child.kind === 'condition') {
        total += 1
        if (!child.field || !child.operator) incomplete += 1
      } else {
        const nested = count(child)
        total += nested.total
        incomplete += nested.incomplete
      }
    }
    return { total, incomplete }
  }
  const root = count(tree.root)
  return {
    total: root.total + tree.exclusion.children.length,
    incomplete: root.incomplete
  }
}
