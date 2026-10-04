import type { Assessment } from './stage'

/**
 * The fail-closed checks for implementation edits: a plan with stable task IDs,
 * acceptance criteria, and no open CRITICAL finding. Empty means the gate is open.
 */
export const gateReasons = (assessment: Assessment): string[] => {
  const reasons: string[] = []

  if (assessment.tasksTotal === 0) {
    reasons.push('tasks.md is missing or has no tasks')
  } else if (assessment.tasksWithoutId > 0) {
    reasons.push(`${assessment.tasksWithoutId} task(s) have no stable ID such as \`1.1\``)
  }

  if (!assessment.hasAcceptanceCriteria) {
    reasons.push('no acceptance criteria: add at least one `#### Scenario:` under specs/')
  }

  if (assessment.openCritical.length > 0) {
    reasons.push(`open CRITICAL finding(s): ${assessment.openCritical.join(', ')}`)
  }

  return reasons
}

export const denyMessage = (plugin: string, change: string, reasons: readonly string[]): string =>
  [
    `${plugin}: edit blocked by the fail-closed gate for change "${change}".`,
    ...reasons.map(reason => `- ${reason}`),
    `Fix these under openspec/changes/${change}/ first; edits inside openspec/ are always allowed.`,
  ].join('\n')

export const noChangeMessage = (plugin: string): string =>
  `${plugin}: edit blocked (strict mode): this project uses OpenSpec but has no active change. ` +
  'Propose a change under openspec/changes/ first; edits inside openspec/ are always allowed.'
