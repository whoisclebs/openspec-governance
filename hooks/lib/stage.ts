import type { SpecRow, Stage } from '../../types'

import { countScenarios, hasHeadings, parseSpec, parseTasks } from './artifacts'
import type { ChangeFiles, Task } from './artifacts'

export type Assessment = {
  stage: Stage
  tasks: Task[]
  specs: SpecRow[]
  missing: string[]
  tasksDone: number
  tasksTotal: number
  tasksWithoutId: number
  hasAcceptanceCriteria: boolean
}

/** The stages in order, `none` aside; the pane draws them as a checklist. */
export const STAGE_ORDER: readonly Exclude<Stage, 'none'>[] = [
  'proposed',
  'designed',
  'specified',
  'ready-to-implement',
  'implemented',
  'done',
]

export const STAGE_EVIDENCE: Record<Exclude<Stage, 'none'>, string> = {
  proposed: 'proposal.md with Why and What Changes',
  designed: 'design.md with Context, Decisions, Migration Plan',
  specified: 'one or more .md files under specs/',
  'ready-to-implement': 'tasks.md with stable task IDs',
  implemented: 'every task checkbox is [x]',
  done: 'the change is archived',
}

const PROPOSAL_HEADINGS = ['Why', 'What Changes'] as const
const DESIGN_HEADINGS = ['Context', 'Decisions', 'Migration Plan'] as const

/**
 * Derives the stage from the artifacts OpenSpec itself defines: proposal, design,
 * specs and tasks. Each stage needs every artifact before it.
 */
export const assess = (files: ChangeFiles): Assessment => {
  const tasks = parseTasks(files.tasks ?? '')
  const tasksWithoutId = tasks.filter(task => task.id === null).length
  const tasksDone = tasks.filter(task => task.isDone).length

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
    specs: files.specs.map(spec => parseSpec(spec.path, spec.content)),
    missing,
    tasksDone,
    tasksTotal: tasks.length,
    tasksWithoutId,
    hasAcceptanceCriteria: countScenarios(files.specs) > 0,
  }

  if (files.isArchived) return { ...common, stage: 'done' }

  const isPlanned = hasProposal && hasDesign && hasSpecs && hasPlan
  if (isPlanned) {
    return { ...common, stage: tasksDone === tasks.length ? 'implemented' : 'ready-to-implement' }
  }

  const stage: Stage = !hasProposal ? 'none' : !hasDesign ? 'proposed' : !hasSpecs ? 'designed' : 'specified'

  return { ...common, stage }
}
