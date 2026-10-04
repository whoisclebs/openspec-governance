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

describe('detail pane', () => {
  const pane = { bodyColumns: 100, maxRows: 40, scroll: { offset: 0, bodyRows: 40 }, view: {} }

  const textOf = async (ui: { findAll: (q: { type: string }) => Promise<{ text?: string }[]> }) =>
    (await ui.findAll({ type: 'Text' })).map(node => node.text ?? '').join('\n')

  test('lists the stage checklist, tasks, findings and recent activity', async ($, on) => {
    const files = readyProject()
    files[`${CHANGE}/findings/sqli.md`] = criticalFinding('open')
    memoryFs(on, files, ROOT)
    mock.clock(on, { now: Date.UTC(2026, 9, 3, 12) })
    await $.tool.call({ tool: 'Write', file_path: SRC, content: 'x' })

    const ui = await $.ui.mount({
      plugin: 'openspec-governance',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'openspec-governance',
      props: { ...pane, title: 'OpenSpec' } as never,
    })
    const text = await textOf(ui)

    expect(text).toContain('add-search')
    expect(text).toContain('▶ planned')
    expect(text).toContain('✔ specified')
    expect(text).toContain('closed: edits outside openspec/ are denied')
    expect(text).toContain('open CRITICAL finding(s)')
    expect(text).toContain('1.1 Add the index')
    expect(text).toContain('CRITICAL')
    expect(text).toContain('sqli.md')
    expect(text).toContain('gate-denied')
  })

  test('says so when no change is active', async ($, on) => {
    memoryFs(on, {}, '/work/plain')
    mock.clock(on, { now: 0 })

    const ui = await $.ui.mount({
      plugin: 'openspec-governance',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'openspec-governance',
      props: { ...pane, title: 'OpenSpec' } as never,
    })

    expect(await textOf(ui)).toContain('No active OpenSpec change')
  })
})

describe('live pane', () => {
  const pane = { bodyColumns: 100, maxRows: 40, scroll: { offset: 0, bodyRows: 40 }, view: {}, title: 'OpenSpec' }
  const OTHER = `${ROOT}/openspec/changes/other`

  const twoChanges = (): Record<string, string> => ({
    ...readyProject(),
    [`${OTHER}/proposal.md`]: PROPOSAL,
    [`${OTHER}/tasks.md`]: '- [ ] 1.1 Unrelated chore\n',
  })

  const textOf = async (ui: { findAll: (q: { type: string }) => Promise<{ text?: string }[]> }) =>
    (await ui.findAll({ type: 'Text' })).map(node => node.text ?? '').join('\n')

  const mount = (
    $: { ui: { mount: (target: never) => Promise<unknown> } },
  ) =>
    $.ui.mount({
      plugin: 'openspec-governance',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'openspec-governance',
      props: pane,
    } as never) as Promise<any>

  const focusFirst = ($: any) => $.tool.call({ tool: 'Read', file_path: `${CHANGE}/proposal.md` })

  test('lists every change with its stage and gate', async ($, on) => {
    memoryFs(on, twoChanges(), ROOT)
    mock.clock(on, { now: 0 })
    await focusFirst($)

    const text = await textOf(await mount($))

    expect(text).toContain('Changes (2)')
    expect(text).toContain('ready-to-implement')
    expect(text).toContain('proposed')
  })

  test('shows every task, not just the first few', async ($, on) => {
    const files = readyProject()
    files[`${CHANGE}/tasks.md`] = Array.from({ length: 30 }, (_, index) => `- [ ] 1.${index + 1} Task number ${index + 1}`).join('\n')
    memoryFs(on, files, ROOT)
    mock.clock(on, { now: 0 })
    await focusFirst($)

    const text = await textOf(await mount($))

    expect(text).toContain('1.1 Task number 1')
    expect(text).toContain('1.30 Task number 30')
    expect(text).not.toContain('more in tasks.md')
  })

  test('the filter box narrows tasks, specs and findings', async ($, on) => {
    const files = readyProject()
    files[`${CHANGE}/specs/search/spec.md`] = '## ADDED Requirements\n### Requirement: Fuzzy match\n#### Scenario: typo\n### Requirement: Exact match\n#### Scenario: same\n'
    memoryFs(on, files, ROOT)
    mock.clock(on, { now: 0 })
    await focusFirst($)
    const ui = await mount($)

    await ui.input({ key: 'filter', text: 'fuzzy' })
    const text = await textOf(ui)

    expect(text).toContain('Fuzzy match')
    expect(text).not.toContain('Exact match')
    expect(text).toContain('No task matches.')
    expect(text).toContain('1 match(es)')

    await ui.input({ key: 'filter', text: 'index' })
    const tasks = await textOf(ui)
    expect(tasks).toContain('1.1 Add the index')
    expect(tasks).not.toContain('1.2 Add tests')
    expect(tasks).toContain('showing 1 of 2')
  })

  test('lists requirements with scenario counts and flags those with none', async ($, on) => {
    const files = readyProject()
    files[`${CHANGE}/specs/search/spec.md`] = '## ADDED Requirements\n### Requirement: Covered\n#### Scenario: a\n#### Scenario: b\n### Requirement: Bare\n'
    memoryFs(on, files, ROOT)
    mock.clock(on, { now: 0 })
    await focusFirst($)

    const text = await textOf(await mount($))

    expect(text).toContain('Specs 1 file(s) · 2 requirement(s) · 2 scenario(s)')
    expect(text).toContain('+ Covered')
    expect(text).toContain('2 scenario(s)')
    expect(text).toContain('+ Bare')
    expect(text).toContain('0 scenario(s)')
  })

  test('focusing another change swaps the detail and the band', async ($, on) => {
    memoryFs(on, twoChanges(), ROOT)
    mock.clock(on, { now: 0 })
    await focusFirst($)
    const ui = await mount($)

    expect(await textOf(ui)).toContain('━━ add-search')

    await ui.press({ key: 'focus-other' })
    const text = await textOf(ui)

    expect(text).toContain('Unrelated chore')
    expect(text).toContain('━━ other')
    expect(text).not.toContain('Add the index')
  })

  test('shows more than one change until it is hidden again', async ($, on) => {
    memoryFs(on, twoChanges(), ROOT)
    mock.clock(on, { now: 0 })
    await focusFirst($)
    const ui = await mount($)

    await ui.press({ key: 'toggle-other' })
    const both = await textOf(ui)
    expect(both).toContain('Add the index')
    expect(both).toContain('Unrelated chore')

    await ui.press({ key: 'toggle-other' })
    expect(await textOf(ui)).not.toContain('Unrelated chore')
  })
})
