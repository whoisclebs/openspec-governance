import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { ChangeInfo, Focus, LogRow, Overview } from '../types'
import { denyMessage, gateReasons, noChangeMessage } from './lib/gate'
import { LOG_FILE, appendRow, formatRow, tailRows } from './lib/log'
import type { LogKind } from './lib/log'
import { dirname, isInside, joinPath, relativeTo, resolvePath } from './lib/paths'
import { currentOf } from './lib/overview'
import { assess } from './lib/stage'
import type { Assessment } from './lib/stage'
import { bandView, detailView } from './lib/views'
import type { Fs } from './lib/workspace'
import {
  changeNameOf,
  changesDir,
  findProjectRoot,
  listActiveChanges,
  loadChange,
  pickChange,
} from './lib/workspace'

const PLUGIN = 'openspec-governance'
const PANE = 'openspec-governance'

const overview = atom({ plugin: 'openspec-governance', key: 'overview' } as const, null)
const focus = atom({ plugin: 'openspec-governance', key: 'focus' } as const, null)
const query = atom({ plugin: 'openspec-governance', key: 'query' } as const, '')
const shown = atom({ plugin: 'openspec-governance', key: 'shown' } as const, [])

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

const changeInfoOf = (name: string, assessment: Assessment, logTail: LogRow[]): ChangeInfo => ({
  name,
  stage: assessment.stage,
  missing: assessment.missing,
  tasksDone: assessment.tasksDone,
  tasksTotal: assessment.tasksTotal,
  gateReasons: gateReasons(assessment),
  tasks: assessment.tasks.map(({ id, text, isDone }) => ({ id, text, isDone })),
  specs: assessment.specs,
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

const infoOf = async ($: Engine, root: string, name: string): Promise<ChangeInfo> =>
  changeInfoOf(name, await assessChange($, root, name), await readLogTail($, root, name))

/**
 * Reloads every active change of a project into the overview. `preferred` takes
 * the focus; otherwise the current focus is kept while its change still exists.
 */
const refreshRoot = async ($: Engine, root: string, preferred?: string) => {
  const names = await listActiveChanges(fsOf($), root)
  const changes = await Promise.all(names.map(name => infoOf($, root, name)))
  const next: Overview = { root, changes }

  const previous = await read($, overview)
  if (JSON.stringify(previous) !== JSON.stringify(next)) await update($, overview, () => next)

  const focused = await read($, focus)
  const isKept =
    preferred === undefined && focused !== null && focused.root === root && names.includes(focused.change)
  if (isKept) return

  const target = preferred ?? (await pickChange(fsOf($), root, root, undefined))
  if (target !== null) await update($, focus, (): Focus => ({ root, change: target }))
}

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
      await refreshRoot($, root, name)
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

  if (before.stage !== after.stage) {
    await log($, root, name, 'stage-check', `\`${before.stage}\` → \`${after.stage}\``)
  }

  await refreshRoot($, root, name)
  return ran
}

const refreshFocused = async ($: Engine) => {
  const focused = await read($, focus)
  if (focused !== null) return refreshRoot($, focused.root)

  const root = await findProjectRoot(fsOf($), await $.session.cwd())
  if (root !== null) await refreshRoot($, root)
}

// While the pane is open it re-reads the artifacts on a timer, so it stays live.
const LIVE_MS = 3000
let liveTimer: { cancel: () => void } | null = null

const startLive = ($: Engine) => {
  if (liveTimer !== null) return
  liveTimer = $.clock.every(LIVE_MS, () => {
    void refreshFocused($).catch(() => undefined)
  })
}

const stopLive = () => {
  liveTimer?.cancel()
  liveTimer = null
}

const openPane = async ($: Engine) => {
  await $.ui.open({ id: PANE, title: 'OpenSpec', focus: true })
  await refreshFocused($).catch(() => undefined)
  startLive($)
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
      await refreshRoot($, root, name)
    }

    return next(e)
  })

  on('command.run', { command: 'openspec' }, async $ => {
    await openPane($)
    return { text: 'OpenSpec pane opened.' }
  })

  on('ui.close', { id: PANE }, ($, e, next) => {
    stopLive()
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'openspec', description: 'Browse the OpenSpec changes, tasks and specs in a live pane' })
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
    const all = await read($, overview)
    const current = currentOf(all, await read($, focus))
    if (all === null || current === null || e.props.hasSurvey) return next(e)

    return bandView($.ui.resolve(e), current, all.changes.length, () => openPane($))
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    const all = await read($, overview)
    const current = currentOf(all, await read($, focus))
    const ui = $.ui.resolve(e)
    if (!('Input' in ui)) return next(e)

    if (all === null || current === null) {
      const { Text } = ui
      return <Text dimColor>No active OpenSpec change. Read or edit a file under openspec/changes/&lt;name&gt;/ to pick one.</Text>
    }

    return detailView(
      ui,
      { overview: all, current, query: await read($, query), shown: await read($, shown) },
      {
        search: value => update($, query, () => value),
        focus: name => update($, focus, (): Focus => ({ root: all.root, change: name })),
        toggle: name =>
          update($, shown, list => (list.includes(name) ? list.filter(one => one !== name) : [...list, name])),
        refresh: () => refreshFocused($),
      },
    )
  })
}
