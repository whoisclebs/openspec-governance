import type { Stage } from '../../types'

import { countScenarios, hasHeadings, parseFinding, parseTasks } from './artifacts'
import type { ChangeFiles, Finding, Task } from './artifacts'

export type Assessment = {
  stage: Stage
  tasks: Task[]
  findings: Finding[]
  missing: string[]
  tasksDone: number
  tasksTotal: number
  tasksWithoutId: number
  hasAcceptanceCriteria: boolean
  openCritical: string[]
}

/** The stages in order, `none` aside; the pane draws them as a checklist. */
export const STAGE_ORDER: readonly Exclude<Stage, 'none'>[] = [
  'discovery',
  'proposed',
  'designed',
  'specified',
  'planned',
  'ready-to-implement',
  'implemented',
  'verified',
  'done',
]

export const STAGE_EVIDENCE: Record<Exclude<Stage, 'none'>, string> = {
  discovery: 'scout-notes.md or investigator output',
  proposed: 'proposal.md with Why and What Changes',
  designed: 'design.md with Context, Decisions, Migration Plan',
  specified: 'one or more .md files under specs/',
  planned: 'tasks.md with stable task IDs',
  'ready-to-implement': 'everything above, no open CRITICAL finding',
  implemented: 'every task checkbox is [x]',
  verified: 'a verification record, no open CRITICAL finding',
  done: 'the change is archived',
}

const PROPOSAL_HEADINGS = ['Why', 'What Changes'] as const
const DESIGN_HEADINGS = ['Context', 'Decisions', 'Migration Plan'] as const

/**
 * Derives the stage from physical artifacts, following the matrix in AGENTS.md:
 * discovery, proposed, designed, specified, planned, ready-to-implement,
 * implemented, verified, done. Each stage needs every artifact before it.
 */
export const assess = (files: ChangeFiles): Assessment => {
  const tasks = parseTasks(files.tasks ?? '')
  const tasksWithoutId = tasks.filter(task => task.id === null).length
  const tasksDone = tasks.filter(task => task.isDone).length
  const scenarios = countScenarios(files.specs)
  const findings = files.findings.map(finding => parseFinding(finding.path, finding.content))
  const openCritical = findings.filter(finding => finding.isOpenCritical).map(finding => finding.path)

  const hasProposal = files.proposal !== null && hasHeadings(files.proposal, PROPOSAL_HEADINGS)
  const hasDesign = files.design !== null && hasHeadings(files.design, DESIGN_HEADINGS)
  const hasSpecs = files.specs.length > 0
  const hasPlan = tasks.length > 0 && tasksWithoutId === 0

  const missing: string[] = []
  if (!hasProposal) missing.push('proposal.md (Why, What Changes)')
  if (!hasDesign) missing.push('design.md (Context, Decisions, Migration Plan)')
  if (!hasSpecs) missing.push('specs/*.md')
  if (!hasPlan) missing.push('tasks.md (stable task IDs)')

  const common = {
    tasks,
    findings,
    missing,
    tasksDone,
    tasksTotal: tasks.length,
    tasksWithoutId,
    hasAcceptanceCriteria: scenarios > 0,
    openCritical,
  }

  if (files.isArchived) return { ...common, stage: 'done' }

  const isPlanned = hasProposal && hasDesign && hasSpecs && hasPlan
  const isImplemented = isPlanned && tasksDone === tasks.length

  if (isImplemented && files.hasVerification && openCritical.length === 0) {
    return { ...common, stage: 'verified' }
  }
  if (isImplemented) return { ...common, stage: 'implemented' }
  if (isPlanned) {
    return { ...common, stage: openCritical.length === 0 ? 'ready-to-implement' : 'planned' }
  }

  const stage: Stage = !hasProposal
    ? files.hasScoutNotes
      ? 'discovery'
      : 'none'
    : !hasDesign
      ? 'proposed'
      : !hasSpecs
        ? 'designed'
        : 'specified'

  return { ...common, stage }
}
