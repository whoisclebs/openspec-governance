import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Focus, LogRow, Snapshot } from '../types'
import { isVerificationName } from './lib/artifacts'
import { denyMessage, gateReasons, noChangeMessage } from './lib/gate'
import { LOG_FILE, appendRow, formatRow, tailRows } from './lib/log'
import type { LogKind } from './lib/log'
import { dirname, isInside, joinPath, relativeTo, resolvePath } from './lib/paths'
import { assess } from './lib/stage'
import type { Assessment } from './lib/stage'
import { bandView, detailView } from './lib/views'
import type { Fs } from './lib/workspace'
import {
  changeNameOf,
  changesDir,
  findProjectRoot,
  loadChange,
  pickChange,
} from './lib/workspace'

const PLUGIN = 'openspec-governance'
const PANE = 'openspec-governance'

const snapshot = atom({ plugin: 'openspec-governance', key: 'snapshot' } as const, null)
const focus = atom({ plugin: 'openspec-governance', key: 'focus' } as const, null)

type Engine = EngineInterface

// `$` is only ever spelled `$.noun.method(...)`, so lib code gets this view of `$.fs`.
const fsOf = ($: Engine): Fs => ({
  read: path => $.fs.read(path),
  list: path => $.fs.list(path),
  exists: path => $.fs.exists(path),
  stat: path => $.fs.stat(path),
})
type Outcome = { deny?: string; isError?: boolean; result?: unknown }

type Edit = { tool: 'Write' | 'Edit' | 'NotebookEdit'; path: string }

const snapshotOf = (root: string, name: string, assessment: Assessment, logTail: LogRow[]): Snapshot => ({
  root,
  change: name,
  stage: assessment.stage,
  missing: assessment.missing,
  tasksDone: assessment.tasksDone,
  tasksTotal: assessment.tasksTotal,
  openCritical: assessment.openCritical.length,
  gateReasons: gateReasons(assessment),
  tasks: assessment.tasks.map(({ id, text, isDone }) => ({ id, text, isDone })),
  findings: assessment.findings.map(finding => ({
    file: finding.path,
    severity: finding.severity,
    status: finding.status,
    isOpenCritical: finding.isOpenCritical,
  })),
  logTail,
})

// Log rows are read-modify-write: one queue keeps parallel tool calls from losing rows.
let logQueue: Promise<unknown> = Promise.resolve()

const assessChange = async ($: Engine, root: string, name: string): Promise<Assessment> =>
  assess(await loadChange(fsOf($), root, name))

const LOG_ROWS_SHOWN = 8

const readLogTail = async ($: Engine, root: string, name: string): Promise<LogRow[]> => {
  const text = await $.fs.read(joinPath(changesDir(root), name, LOG_FILE)).then(
    value => (typeof value === 'string' ? value : null),
    () => null,
  )

  return tailRows(text, LOG_ROWS_SHOWN)
}

const publish = async ($: Engine, root: string, name: string, assessment: Assessment) => {
  const logTail = await readLogTail($, root, name)
  await update($, snapshot, () => snapshotOf(root, name, assessment, logTail))
  await update($, focus, (): Focus => ({ root, change: name }))
}

const refresh = async ($: Engine, root: string, name: string) =>
  publish($, root, name, await assessChange($, root, name))

const log = ($: Engine, root: string, name: string, kind: LogKind, detail: string) => {
  const path = joinPath(changesDir(root), name, LOG_FILE)

  const write = async () => {
    const time = new Date(await $.clock.now()).toISOString()
    const existing = await $.fs.read(path).then(
      text => (typeof text === 'string' ? text : null),
      () => null,
    )
    await $.fs.write(path, appendRow(existing, formatRow(time, kind, detail)))
  }

  logQueue = logQueue.then(write).catch(error => {
    $.ui.log(`${PLUGIN}: could not append to ${path}: ${String(error)}`, { to: 'debug' })
  })

  return logQueue
}

const governed = async <R extends Outcome>(
  $: Engine,
  settings: PluginOptions,
  edit: Edit,
  run: () => Promise<R>,
): Promise<R | { deny: string }> => {
  const file = resolvePath(await $.session.cwd(), edit.path)
  const root = await findProjectRoot(fsOf($), dirname(file))
  if (root === null) return run()

  const isArtifact = isInside(joinPath(root, 'openspec'), file)
  const named = changeNameOf(root, file)

  if (named !== null && file.endsWith(`/${LOG_FILE}`)) {
    return { deny: `${PLUGIN}: ${LOG_FILE} is append-only and maintained by the plugin.` }
  }

  const mode = settings.gate ?? 'enforce'
  const focused = (await read($, focus))?.change
  const name = isArtifact ? named : await pickChange(fsOf($), root, file, focused)

  if (name === null) {
    const isStrictDenial = !isArtifact && settings.strict === true && mode === 'enforce'
    return isStrictDenial ? { deny: noChangeMessage(PLUGIN) } : run()
  }

  const before = await assessChange($, root, name)
  const reasons = isArtifact || mode === 'off' ? [] : gateReasons(before)

  if (reasons.length > 0) {
    const relative = relativeTo(root, file)

    if (mode === 'enforce') {
      await log($, root, name, 'gate-denied', `${edit.tool} \`${relative}\`: ${reasons.join('; ')}`)
      await publish($, root, name, before)
      return { deny: denyMessage(PLUGIN, name, reasons) }
    }

    $.ui.toast(`${PLUGIN}: "${name}" fails the gate (${reasons.length}); edit allowed (warn mode)`)
    await log($, root, name, 'gate-warned', `${edit.tool} \`${relative}\`: ${reasons.join('; ')}`)
  }

  const ran = await run()
  const staged = (ran.result as { staged?: boolean } | undefined)?.staged === true
  if (ran.deny !== undefined || ran.isError === true || staged) return ran

  const after = await assessChange($, root, name)
  const relative = relativeTo(root, file)

  if (!isArtifact) {
    await log(
      $,
      root,
      name,
      'implementation',
      `${edit.tool} \`${relative}\` (tasks ${after.tasksDone}/${after.tasksTotal}, stage ${after.stage})`,
    )
  }

  const inFindings = isInside(joinPath(changesDir(root), name, 'findings'), file)
  if (inFindings) {
    const isVerification = isVerificationName(file.split('/').pop() ?? '')
    await log($, root, name, isVerification ? 'verification' : 'finding', `${edit.tool} \`${relative}\``)
  } else if (isArtifact && isVerificationName(file.split('/').pop() ?? '')) {
    await log($, root, name, 'verification', `${edit.tool} \`${relative}\``)
  }

  if (before.stage !== after.stage) {
    await log($, root, name, 'stage-check', `\`${before.stage}\` → \`${after.stage}\``)
  }

  await publish($, root, name, after)
  return ran
}

const refreshFocused = async ($: Engine) => {
  const focused = await read($, focus)
  if (focused !== null) return refresh($, focused.root, focused.change)

  const root = await findProjectRoot(fsOf($), await $.session.cwd())
  if (root === null) return

  const name = await pickChange(fsOf($), root, root, undefined)
  if (name !== null) await refresh($, root, name)
}

export const register: Register = (on, options) => {
  on('tool.call', { tool: 'Write' }, ($, e, next) =>
    governed($, options, { tool: 'Write', path: e.file_path }, () => next(e)),
  )
  on('tool.call', { tool: 'Edit' }, ($, e, next) =>
    governed($, options, { tool: 'Edit', path: e.file_path }, () => next(e)),
  )
  on('tool.call', { tool: 'NotebookEdit' }, ($, e, next) =>
    governed($, options, { tool: 'NotebookEdit', path: e.notebook_path }, () => next(e)),
  )

  // Reading an artifact of a change tells the band which change the session is on.
  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const file = resolvePath(await $.session.cwd(), e.file_path)
    const root = await findProjectRoot(fsOf($), dirname(file))
    const name = root === null ? null : changeNameOf(root, file)

    if (root !== null && name !== null && (await read($, focus))?.change !== name) {
      await refresh($, root, name)
    }

    return next(e)
  })

  on('command.run', { command: 'openspec' }, async $ => {
    await $.ui.open({ id: PANE, title: 'OpenSpec' })
    return { text: 'OpenSpec pane opened.' }
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'openspec', description: 'Show the active OpenSpec change in a pane' })
    const started = await next(e)
    await refreshFocused($).catch(() => undefined)
    return started
  })

  // Bash, the openspec CLI or another agent may have changed artifacts since the last edit.
  on('turn.complete', async ($, e, next) => {
    await refreshFocused($).catch(() => undefined)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, snapshot)
    if (current === null || e.props.hasSurvey) return next(e)

    return bandView(
      $.ui.resolve(e),
      current,
      () => $.ui.open({ id: PANE, title: 'OpenSpec' }),
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    const current = await read($, snapshot)
    const ui = $.ui.resolve(e)

    if (current === null) {
      const { Text } = ui
      return <Text dimColor>No active OpenSpec change. Read or edit a file under openspec/changes/&lt;name&gt;/ to pick one.</Text>
    }

    return detailView(ui, current, () => refreshFocused($))
  })
}
