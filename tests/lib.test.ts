import { describe, expect, test } from 'claude-code/testing'

import { countScenarios, hasHeadings, parseFinding, parseSpec, parseTasks } from '../hooks/lib/artifacts'
import type { ChangeFiles } from '../hooks/lib/artifacts'
import { matchesQuery } from '../hooks/lib/filter'
import { gateReasons } from '../hooks/lib/gate'
import { appendRow, formatRow, tailRows } from '../hooks/lib/log'
import { dirname, isInside, normalizePath, relativeTo, resolvePath } from '../hooks/lib/paths'
import { currentOf, matchCount, visibleChanges } from '../hooks/lib/overview'
import { assess } from '../hooks/lib/stage'
import { DESIGN, PROPOSAL, SPEC, TASKS, criticalFinding } from './fixtures'

const files = (overrides: Partial<ChangeFiles> = {}): ChangeFiles => ({
  name: 'add-search',
  isArchived: false,
  hasScoutNotes: false,
  proposal: null,
  design: null,
  tasks: null,
  specs: [],
  findings: [],
  hasVerification: false,
  ...overrides,
})

const spec = { path: 'specs/search/spec.md', content: SPEC }

describe('paths', () => {
  test('folds dots and resolves against the working directory', () => {
    expect(normalizePath('/a/./b/../c')).toBe('/a/c')
    expect(resolvePath('/work', 'app/x.go')).toBe('/work/app/x.go')
    expect(resolvePath('/work', '/abs/x.go')).toBe('/abs/x.go')
    expect(dirname('/a/b.go')).toBe('/a')
    expect(dirname('/b.go')).toBe('/')
  })

  test('tells inside from outside by whole segments', () => {
    expect(isInside('/a/openspec', '/a/openspec/changes')).toBe(true)
    expect(isInside('/a/openspec', '/a/openspec-x/changes')).toBe(false)
    expect(relativeTo('/a', '/a/b/c.go')).toBe('b/c.go')
  })
})

describe('parseTasks', () => {
  test('reads checkboxes, stable IDs and done flags', () => {
    const tasks = parseTasks('- [x] 1.1 Done\n  - [ ] 1.2) Nested\n- [ ] No id here\n* [X] 2 Star\n')

    expect(tasks.map(task => task.id)).toEqual(['1.1', '1.2', null, '2'])
    expect(tasks.map(task => task.isDone)).toEqual([true, false, false, true])
  })
})

describe('parseFinding', () => {
  test('is open CRITICAL for front matter, bold and bullet forms', () => {
    expect(parseFinding('a.md', criticalFinding('open')).isOpenCritical).toBe(true)
    expect(parseFinding('b.md', '**Severity**: CRITICAL\n**Status:** New\n').isOpenCritical).toBe(true)
    expect(parseFinding('c.md', '- Severity: critical\n- Status: open\n').isOpenCritical).toBe(true)
  })

  test('is closed once the status says so', () => {
    expect(parseFinding('a.md', criticalFinding('resolved')).isOpenCritical).toBe(false)
    expect(parseFinding('b.md', criticalFinding("won't fix")).isOpenCritical).toBe(false)
  })

  test('fails closed when a CRITICAL finding has no status', () => {
    expect(parseFinding('a.md', 'severity: CRITICAL\n').isOpenCritical).toBe(true)
  })

  test('ignores findings below CRITICAL', () => {
    expect(parseFinding('a.md', 'severity: HIGH\nstatus: open\n').isOpenCritical).toBe(false)
  })
})

describe('artifact checks', () => {
  test('counts scenarios and required headings', () => {
    expect(countScenarios([spec, spec])).toBe(2)
    expect(hasHeadings(PROPOSAL, ['Why', 'What Changes'])).toBe(true)
    expect(hasHeadings('## Why only', ['Why', 'What Changes'])).toBe(false)
  })
})

describe('assess', () => {
  const full = { proposal: PROPOSAL, design: DESIGN, specs: [spec], tasks: TASKS }

  test('walks the stage matrix as artifacts appear', () => {
    expect(assess(files()).stage).toBe('none')
    expect(assess(files({ hasScoutNotes: true })).stage).toBe('discovery')
    expect(assess(files({ proposal: PROPOSAL })).stage).toBe('proposed')
    expect(assess(files({ proposal: PROPOSAL, design: DESIGN })).stage).toBe('designed')
    expect(assess(files({ proposal: PROPOSAL, design: DESIGN, specs: [spec] })).stage).toBe('specified')
    expect(assess(files(full)).stage).toBe('ready-to-implement')
  })

  test('lists what is still missing, in order', () => {
    expect(assess(files({ proposal: PROPOSAL })).missing).toEqual([
      'design.md (Context, Decisions, Migration Plan)',
      'specs/*.md',
      'tasks.md (stable task IDs)',
    ])
  })

  test('an open CRITICAL finding keeps a planned change from being ready', () => {
    const finding = { path: 'findings/f.md', content: criticalFinding('open') }

    expect(assess(files({ ...full, findings: [finding] })).stage).toBe('planned')
  })

  test('implemented when every task is checked, verified with evidence', () => {
    const done = { ...full, tasks: '- [x] 1.1 a\n- [x] 1.2 b\n' }

    expect(assess(files(done)).stage).toBe('implemented')
    expect(assess(files({ ...done, hasVerification: true })).stage).toBe('verified')
    expect(assess(files({ ...done, isArchived: true })).stage).toBe('done')
  })

  test('verification does not count while a CRITICAL finding is open', () => {
    const finding = { path: 'findings/f.md', content: criticalFinding('open') }
    const done = { ...full, tasks: '- [x] 1.1 a\n', hasVerification: true, findings: [finding] }

    expect(assess(files(done)).stage).toBe('implemented')
  })
})

describe('gateReasons', () => {
  test('is open for a planned change with acceptance criteria', () => {
    expect(gateReasons(assess(files({ specs: [spec], tasks: TASKS })))).toEqual([])
  })

  test('names each failed check', () => {
    const reasons = gateReasons(assess(files({ tasks: '- [ ] no id\n' })))

    expect(reasons).toHaveLength(2)
    expect(reasons.join(' ')).toContain('stable ID')
    expect(reasons.join(' ')).toContain('acceptance criteria')
    expect(gateReasons(assess(files())).join(' ')).toContain('tasks.md is missing')
  })
})

describe('execution log', () => {
  test('creates the header once and then only appends', () => {
    const first = appendRow(null, formatRow('2026-10-03T00:00:00.000Z', 'implementation', 'Edit `a.go`'))
    const second = appendRow(first, formatRow('2026-10-03T00:00:01.000Z', 'stage-check', 'x → y'))

    expect(first.startsWith('# Execution Log')).toBe(true)
    expect(second.startsWith(first)).toBe(true)
    expect(second.match(/# Execution Log/g)).toHaveLength(1)
    expect(second.trimEnd().split('\n').at(-1)).toContain('stage-check')
  })

  test('keeps a row on one line when the detail has pipes or newlines', () => {
    expect(formatRow('t', 'finding', 'a | b\nc')).toBe('| t | finding | a \\| b c |')
  })
})

describe('tailRows', () => {
  const log = [
    '# Execution Log',
    '',
    '| Time (UTC) | Kind | Detail |',
    '| --- | --- | --- |',
    '| 2026-10-03T12:00:00.000Z | gate-denied | Write `a.go`: no tasks |',
    '| 2026-10-03T12:01:00.000Z | implementation | Edit `a \\| b.go` |',
    '| 2026-10-03T12:02:00.000Z | stage-check | `planned` → `ready-to-implement` |',
    '',
  ].join('\n')

  test('returns the newest rows, oldest first, skipping the header', () => {
    const rows = tailRows(log, 2)

    expect(rows.map(row => row.kind)).toEqual(['implementation', 'stage-check'])
    expect(rows[0]?.detail).toBe('Edit `a | b.go`')
  })

  test('is empty without a log', () => {
    expect(tailRows(null, 5)).toEqual([])
  })
})

describe('parseSpec', () => {
  const delta = [
    '## ADDED Requirements',
    '### Requirement: Search by name',
    '#### Scenario: match',
    '#### Scenario: no match',
    '### Requirement: Search by tag',
    '## MODIFIED Requirements',
    '### Requirement: Ranking',
    '#### Scenario: newest first',
  ].join('\n')

  test('reads requirements, their delta operation and scenario counts', () => {
    const spec = parseSpec('/p/openspec/changes/c/specs/search/spec.md', delta)

    expect(spec.capability).toBe('search')
    expect(spec.requirements).toEqual([
      { name: 'Search by name', op: 'ADDED', scenarios: 2 },
      { name: 'Search by tag', op: 'ADDED', scenarios: 0 },
      { name: 'Ranking', op: 'MODIFIED', scenarios: 1 },
    ])
  })

  test('marks requirements of a plain spec with no delta heading', () => {
    const spec = parseSpec('/p/openspec/specs/auth/spec.md', '### Requirement: Login\n#### Scenario: ok\n')

    expect(spec.requirements).toEqual([{ name: 'Login', op: 'SPEC', scenarios: 1 }])
  })
})

describe('matchesQuery', () => {
  test('needs every word, in any field, ignoring case', () => {
    expect(matchesQuery('', 'anything')).toBe(true)
    expect(matchesQuery('add INDEX', '1.1', 'Add the index in search.go')).toBe(true)
    expect(matchesQuery('add tests', '1.1', 'Add the index')).toBe(false)
    expect(matchesQuery('x', null, undefined)).toBe(false)
  })
})

describe('overview helpers', () => {
  const change = (name: string, text: string) => ({
    name,
    stage: 'planned' as const,
    missing: [],
    tasksDone: 0,
    tasksTotal: 1,
    openCritical: 0,
    gateReasons: [],
    tasks: [{ id: '1.1', text, isDone: false }],
    findings: [],
    specs: [],
    logTail: [],
  })
  const overview = { root: '/p', changes: [change('a', 'alpha'), change('b', 'beta'), change('c', 'gamma')] }

  test('currentOf follows the focus and falls back to the first change', () => {
    expect(currentOf(overview, { root: '/p', change: 'b' })?.name).toBe('b')
    expect(currentOf(overview, { root: '/p', change: 'gone' })?.name).toBe('a')
    expect(currentOf(overview, { root: '/other', change: 'b' })?.name).toBe('a')
    expect(currentOf(null, null)).toBeNull()
  })

  test('visibleChanges puts the focus first, then the shown ones in list order', () => {
    const current = overview.changes[1]!

    expect(visibleChanges(overview, current, ['c', 'a']).map(one => one.name)).toEqual(['b', 'a', 'c'])
  })

  test('matchCount counts matching tasks', () => {
    expect(matchCount(overview.changes[0]!, 'alpha')).toBe(1)
    expect(matchCount(overview.changes[0]!, 'beta')).toBe(0)
  })
})
