/** Pure parsers for the Markdown artifacts of an OpenSpec change. */

import type { SpecRow } from '../../types'

export type Task = { id: string | null; isDone: boolean; text: string }

export type Finding = {
  path: string
  severity: string | null
  status: string | null
  isOpenCritical: boolean
}

export type SpecFile = { path: string; content: string }

/** Everything the stage matrix reads, as plain text, so assessing is pure. */
export type ChangeFiles = {
  name: string
  isArchived: boolean
  hasScoutNotes: boolean
  proposal: string | null
  design: string | null
  tasks: string | null
  specs: SpecFile[]
  findings: SpecFile[]
  hasVerification: boolean
}

const TASK_LINE = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/
const TASK_ID = /^(\d+(?:\.\d+)*)[.):]?(?:\s|$)/

export const parseTasks = (markdown: string): Task[] => {
  const tasks: Task[] = []

  for (const line of markdown.split('\n')) {
    const match = TASK_LINE.exec(line)
    if (match === null) continue

    const text = (match[2] ?? '').trim()
    const id = TASK_ID.exec(text)

    tasks.push({ id: id?.[1] ?? null, isDone: match[1] !== ' ', text })
  }

  return tasks
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const hasHeading = (markdown: string, title: string): boolean =>
  new RegExp(`^#{1,6}\\s+${escapeRegExp(title)}\\b`, 'im').test(markdown)

export const hasHeadings = (markdown: string, titles: readonly string[]): boolean =>
  titles.every(title => hasHeading(markdown, title))

export const countScenarios = (specs: readonly SpecFile[]): number =>
  specs.reduce((sum, spec) => sum + (spec.content.match(/^#{3,6}\s+Scenario\b/gim)?.length ?? 0), 0)

const FIELD = (name: string) =>
  new RegExp(`^[\\s>*_-]*${name}[\\s*_]*[:=][\\s*_\`]*([A-Za-z][A-Za-z' -]*)`, 'im')

const CLOSED = /^(resolved|closed|fixed|done|mitigated|accepted|invalid|duplicate|wont fix|won't fix|wontfix)/i

/**
 * Reads `severity` and `status` from a finding record, in front matter or as a
 * bold/bullet line. A finding with no status counts as open: the gate fails closed.
 */
export const parseFinding = (path: string, content: string): Finding => {
  const severity = FIELD('severity').exec(content)?.[1]?.trim().toUpperCase() ?? null
  const status = FIELD('status').exec(content)?.[1]?.trim().toLowerCase() ?? null
  const isOpen = status === null || !CLOSED.test(status)

  return { path, severity, status, isOpenCritical: severity === 'CRITICAL' && isOpen }
}

export const isVerificationName = (name: string): boolean => /verif/i.test(name)

const DELTA_HEADING = /^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements\b/i
const REQUIREMENT_HEADING = /^#{2,4}\s+Requirement:\s*(.+?)\s*$/i
const SCENARIO_HEADING = /^#{3,6}\s+Scenario\b/i

/** Reads the requirements of a spec file and how many scenarios each one has. */
export const parseSpec = (path: string, content: string): SpecRow => {
  const capability = /\/specs\/([^/]+)\//.exec(path)?.[1] ?? path.split('/').pop() ?? path
  const requirements: SpecRow['requirements'] = []
  let op = 'SPEC'

  for (const line of content.split('\n')) {
    const delta = DELTA_HEADING.exec(line)
    if (delta !== null) {
      op = (delta[1] ?? 'SPEC').toUpperCase()
      continue
    }

    const requirement = REQUIREMENT_HEADING.exec(line)
    if (requirement !== null) {
      requirements.push({ name: requirement[1] ?? '', op, scenarios: 0 })
      continue
    }

    const last = requirements.at(-1)
    if (last !== undefined && SCENARIO_HEADING.test(line)) last.scenarios += 1
  }

  return { capability, file: path, requirements }
}
