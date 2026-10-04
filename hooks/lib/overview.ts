import type { ChangeInfo, Focus, Overview } from '../../types'
import { matchesQuery } from './filter'

/** The focused change, or the first one when focus is unset or points elsewhere. */
export const currentOf = (overview: Overview | null, focus: Focus | null): ChangeInfo | null => {
  if (overview === null) return null

  const focused =
    focus !== null && focus.root === overview.root
      ? overview.changes.find(change => change.name === focus.change)
      : undefined

  return focused ?? overview.changes[0] ?? null
}

/** Changes drawn in full: the focused one first, then the shown ones in list order. */
export const visibleChanges = (
  overview: Overview,
  current: ChangeInfo,
  shown: readonly string[],
): ChangeInfo[] => [
  current,
  ...overview.changes.filter(change => change.name !== current.name && shown.includes(change.name)),
]

/** How many tasks, requirements and findings of a change match the query. */
export const matchCount = (change: ChangeInfo, query: string): number =>
  change.tasks.filter(task => matchesQuery(query, task.id, task.text)).length +
  change.specs.flatMap(spec => spec.requirements.filter(req => matchesQuery(query, spec.capability, req.name))).length +
  change.findings.filter(finding => matchesQuery(query, finding.file, finding.severity, finding.status)).length
