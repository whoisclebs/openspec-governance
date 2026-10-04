import type { LogRow } from '../../types'

export type LogKind =
  | 'stage-check'
  | 'implementation'
  | 'gate-denied'
  | 'gate-warned'
  | 'finding'
  | 'verification'

export const LOG_FILE = 'execution-log.md'

const HEADER = [
  '# Execution Log',
  '',
  'Append-only record of stage checks, implementations, findings and verifications.',
  'Maintained by the `openspec-governance` plugin; do not edit by hand.',
  '',
  '| Time (UTC) | Kind | Detail |',
  '| --- | --- | --- |',
  '',
].join('\n')

const cell = (text: string): string => text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim()

export const formatRow = (isoTime: string, kind: LogKind, detail: string): string =>
  `| ${isoTime} | ${kind} | ${cell(detail)} |`

/** Adds one row at the end of the log, creating the header when there is no log yet. */
export const appendRow = (existing: string | null, row: string): string => {
  const base = existing === null || existing.trim() === '' ? HEADER : existing
  return `${base.endsWith('\n') ? base : `${base}\n`}${row}\n`
}

const ROW = /^\|\s*(\d{4}-\d{2}-\d{2}T[^|\s]+)\s*\|\s*([a-z-]+)\s*\|\s*(.*?)\s*\|\s*$/

/** The last `count` rows of a log, oldest first; the header and any stray lines are skipped. */
export const tailRows = (log: string | null, count: number): LogRow[] =>
  (log ?? '')
    .split('\n')
    .flatMap(line => {
      const match = ROW.exec(line)
      return match === null ? [] : [{ time: match[1] ?? '', kind: match[2] ?? '', detail: (match[3] ?? '').replace(/\\\|/g, '|') }]
    })
    .slice(-count)
