import { describe, expect, mock, test } from 'claude-code/testing'

import { memoryFs } from './memory-fs'
import { CHANGE, PROPOSAL, ROOT, TASKS, criticalFinding, readyProject } from './fixtures'

const LOG = `${CHANGE}/execution-log.md`
const SRC = `${ROOT}/src/search.go`

describe('fail-closed gate', () => {
  test('leaves projects without OpenSpec alone', async ($, on) => {
    const files = { '/work/plain/main.go': 'package main\n' }
    memoryFs(on, files, '/work/plain')
    mock.clock(on, { now: 0 })

    const res = await $.tool.call({ tool: 'Write', file_path: '/work/plain/main.go', content: 'x' })

    expect(res.deny).toBeUndefined()
    expect(Object.keys(files)).toEqual(['/work/plain/main.go'])
  })

  test('denies source edits while the change has no tasks.md', async ($, on) => {
    const files: Record<string, string> = { [`${CHANGE}/proposal.md`]: PROPOSAL, [SRC]: 'old' }
    memoryFs(on, files, ROOT)
    mock.clock(on, { now: Date.UTC(2026, 9, 3) })

    const res = await $.tool.call({ tool: 'Write', file_path: SRC, content: 'new' })

    expect(res.deny).toContain('tasks.md')
    expect(files[SRC]).toBe('old')
    expect(files[LOG]).toContain('| gate-denied |')
  })

  test('denies while no acceptance criteria exist', async ($, on) => {
    const files = readyProject()
    delete files[`${CHANGE}/specs/search/spec.md`]
    memoryFs(on, files, ROOT)
    mock.clock(on, { now: 0 })

    const res = await $.tool.call({ tool: 'Edit', file_path: SRC, old_string: 'package', new_string: 'pkg' })

    expect(res.deny).toContain('acceptance criteria')
  })

  test('allows source edits once the change is ready and logs them', async ($, on) => {
    const files = readyProject()
    memoryFs(on, files, ROOT)
    mock.clock(on, { now: Date.UTC(2026, 9, 3, 12) })

    const res = await $.tool.call({ tool: 'Write', file_path: SRC, content: 'new' })

    expect(res.deny).toBeUndefined()
    expect(files[SRC]).toBe('new')
    expect(files[LOG]).toContain('2026-10-03T12:00:00.000Z | implementation |')
    expect(files[LOG]).toContain('`src/search.go` (tasks 0/2, stage ready-to-implement)')
  })

  test('an open CRITICAL finding closes the gate, a resolved one does not', async ($, on) => {
    const files = readyProject()
    files[`${CHANGE}/findings/sqli.md`] = criticalFinding('open')
    memoryFs(on, files, ROOT)
    mock.clock(on, { now: 0 })

    const blocked = await $.tool.call({ tool: 'Write', file_path: SRC, content: 'a' })
    expect(blocked.deny).toContain('CRITICAL')

    files[`${CHANGE}/findings/sqli.md`] = criticalFinding('resolved')
    const open = await $.tool.call({ tool: 'Write', file_path: SRC, content: 'b' })
    expect(open.deny).toBeUndefined()
  })

  test('always allows edits inside openspec/ and logs the stage change', async ($, on) => {
    const files: Record<string, string> = {
      [`${CHANGE}/proposal.md`]: PROPOSAL,
      [`${CHANGE}/design.md`]: '## Context\n\n## Decisions\n\n## Migration Plan\n',
      [`${CHANGE}/specs/search/spec.md`]: '#### Scenario: x\n',
    }
    memoryFs(on, files, ROOT)
    mock.clock(on, { now: 0 })

    const res = await $.tool.call({ tool: 'Write', file_path: `${CHANGE}/tasks.md`, content: TASKS })

    expect(res.deny).toBeUndefined()
    expect(files[LOG]).toContain('`specified` → `ready-to-implement`')
    expect(files[LOG]).not.toContain('| implementation |')
  })

  test('keeps the execution log append-only', async ($, on) => {
    const files = readyProject()
    memoryFs(on, files, ROOT)
    mock.clock(on, { now: 0 })
    await $.tool.call({ tool: 'Write', file_path: SRC, content: 'x' })
    const before = files[LOG]

    const res = await $.tool.call({ tool: 'Write', file_path: LOG, content: 'wiped' })

    expect(res.deny).toContain('append-only')
    expect(files[LOG]).toBe(before)
  })

  test('appends rather than rewrites across several edits', async ($, on) => {
    const files = readyProject()
    memoryFs(on, files, ROOT)
    mock.clock(on, { now: 0 })

    await Promise.all([
      $.tool.call({ tool: 'Write', file_path: SRC, content: '1' }),
      $.tool.call({ tool: 'Write', file_path: `${ROOT}/src/b.go`, content: '2' }),
      $.tool.call({ tool: 'Write', file_path: `${ROOT}/src/c.go`, content: '3' }),
    ])

    expect(files[LOG]?.match(/\| implementation \|/g)).toHaveLength(3)
  })

  test('warn mode lets the edit through and records the warning', { options: { gate: 'warn' } }, async ($, on) => {
    const files: Record<string, string> = { [`${CHANGE}/proposal.md`]: PROPOSAL, [SRC]: 'old' }
    memoryFs(on, files, ROOT)
    mock.clock(on, { now: 0 })

    const res = await $.tool.call({ tool: 'Write', file_path: SRC, content: 'new' })

    expect(res.deny).toBeUndefined()
    expect(files[SRC]).toBe('new')
    expect(files[LOG]).toContain('| gate-warned |')
  })

  test('off mode skips the gate', { options: { gate: 'off' } }, async ($, on) => {
    const files: Record<string, string> = { [`${CHANGE}/proposal.md`]: PROPOSAL }
    memoryFs(on, files, ROOT)
    mock.clock(on, { now: 0 })

    const res = await $.tool.call({ tool: 'Write', file_path: SRC, content: 'x' })

    expect(res.deny).toBeUndefined()
  })
})

describe('strict mode', () => {
  const quiet = (): Record<string, string> => ({ [`${ROOT}/openspec/changes/archive/old/proposal.md`]: PROPOSAL })

  test('denies when no change is active', { options: { strict: true } }, async ($, on) => {
    memoryFs(on, quiet(), ROOT)
    mock.clock(on, { now: 0 })

    const res = await $.tool.call({ tool: 'Write', file_path: SRC, content: 'x' })

    expect(res.deny).toContain('no active change')
  })

  test('allows when not strict', async ($, on) => {
    memoryFs(on, quiet(), ROOT)
    mock.clock(on, { now: 0 })

    const res = await $.tool.call({ tool: 'Write', file_path: SRC, content: 'x' })

    expect(res.deny).toBeUndefined()
  })
})

describe('stage band', () => {
  const props = {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  }

  test('shows the change, stage, progress and gate after an edit', async ($, on) => {
    memoryFs(on, readyProject(), ROOT)
    mock.clock(on, { now: 0 })
    await $.tool.call({ tool: 'Write', file_path: SRC, content: 'x' })

    const ui = await $.ui.mount({ plugin: 'openspec-governance', surface: 'terminal', component: 'AbovePrompt', props })
    const text = (await ui.findAll({ type: 'Text' })).map(node => node.text).join('')

    expect(text).toContain('add-search')
    expect(text).toContain('ready-to-implement')
    expect(text).toContain('0/2')
    expect(text).toContain('gate open')
  })

  test('shows a closed gate with the next missing artifact', async ($, on) => {
    memoryFs(on, { [`${CHANGE}/proposal.md`]: PROPOSAL }, ROOT)
    mock.clock(on, { now: 0 })
    await $.tool.call({ tool: 'Read', file_path: `${CHANGE}/proposal.md` })

    const ui = await $.ui.mount({ plugin: 'openspec-governance', surface: 'terminal', component: 'AbovePrompt', props })
    const text = (await ui.findAll({ type: 'Text' })).map(node => node.text).join('')

    expect(text).toContain('gate closed')
    expect(text).toContain('next: design.md')
  })
})
