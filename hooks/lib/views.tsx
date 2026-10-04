import type { EngineInterface } from 'claude-code'

import type { ChangeInfo, Overview } from '../../types'
import { matchesQuery } from './filter'
import { matchCount, visibleChanges } from './overview'
import { STAGE_EVIDENCE, STAGE_ORDER } from './stage'

/** The element table `$.ui.resolve(e)` returns; the hooks module hands it in. */
export type Ui = ReturnType<EngineInterface['ui']['resolve']>

/** The surfaces that have an `Input`; mobile has none, so the pane is not drawn there. */
export type InputUi = Extract<Ui, { Input: unknown }>

export type PaneContext = {
  overview: Overview
  current: ChangeInfo
  query: string
  shown: readonly string[]
}

export type PaneActions = {
  search: (value: string) => unknown
  focus: (change: string) => unknown
  toggle: (change: string) => unknown
  refresh: () => unknown
}

const BAR_WIDTH = 10

export const progressBar = (done: number, total: number): string => {
  const filled = total === 0 ? 0 : Math.round((done / total) * BAR_WIDTH)
  return '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled)
}

const baseName = (path: string): string => path.split('/').pop() ?? path

const specPath = (path: string): string => path.split('/specs/').pop() ?? path

const OP_MARK: Record<string, string> = { ADDED: '+', MODIFIED: '~', REMOVED: '-', RENAMED: '→', SPEC: '•' }

/** One row above the prompt: change, stage, progress and gate. */
export const bandView = (ui: Ui, change: ChangeInfo, changeCount: number, onDetails: () => void) => {
  const { Box, Button, Text } = ui
  const isBlocked = change.gateReasons.length > 0
  const hint = change.missing[0]

  return (
    <Box>
      <Text bold>OpenSpec </Text>
      <Text>{change.name}</Text>
      {changeCount > 1 ? <Text dimColor> (+{changeCount - 1})</Text> : null}
      <Text dimColor> · </Text>
      <Text color="cyan">{change.stage}</Text>
      <Text dimColor> · </Text>
      <Text>
        {progressBar(change.tasksDone, change.tasksTotal)} {change.tasksDone}/{change.tasksTotal}
      </Text>
      <Text dimColor> · </Text>
      <Text color={isBlocked ? 'red' : 'green'}>
        {isBlocked ? `gate closed (${change.gateReasons.length})` : 'gate open'}
      </Text>
      {change.openCritical > 0 ? <Text color="red"> · {change.openCritical} CRITICAL</Text> : null}
      {hint === undefined ? null : <Text dimColor> · next: {hint}</Text>}
      <Text> </Text>
      <Button key="details" label="Details" onPress={onDetails} />
    </Box>
  )
}

/** Everything the pane knows about one change, narrowed by the filter box. */
const changeBlock = (ui: Ui, change: ChangeInfo, query: string, isCurrent: boolean) => {
  const { Box, Text } = ui
  const isFiltering = query.trim() !== ''
  const isBlocked = change.gateReasons.length > 0
  const current = (STAGE_ORDER as readonly string[]).indexOf(change.stage)

  const tasks = change.tasks.filter(task => matchesQuery(query, task.id, task.text))
  const findings = change.findings.filter(finding =>
    matchesQuery(query, baseName(finding.file), finding.severity, finding.status),
  )
  const rows = change.logTail.filter(row => matchesQuery(query, row.kind, row.detail))
  const specs = change.specs
    .map(spec => {
      const isWholeMatch = matchesQuery(query, spec.capability, specPath(spec.file))
      const requirements = isWholeMatch
        ? spec.requirements
        : spec.requirements.filter(requirement => matchesQuery(query, requirement.name))
      return { spec, requirements, isMatch: isWholeMatch || requirements.length > 0 }
    })
    .filter(entry => entry.isMatch)

  const requirementCount = change.specs.reduce((sum, spec) => sum + spec.requirements.length, 0)
  const scenarioCount = change.specs.reduce(
    (sum, spec) => sum + spec.requirements.reduce((inner, requirement) => inner + requirement.scenarios, 0),
    0,
  )

  return (
    <Box key={`block-${change.name}`} flexDirection="column">
      <Text> </Text>
      <Text bold color="cyan">
        ━━ {change.name}
        {isCurrent ? '  (focus)' : ''}
      </Text>

      {isFiltering ? null : (
        <Box flexDirection="column">
          <Text bold underline>Stage</Text>
          {STAGE_ORDER.map((stage, index) => (
            <Box key={`stage-${change.name}-${stage}`}>
              <Text
                color={index < current ? 'green' : index === current ? 'cyan' : undefined}
                dimColor={index > current}
                bold={index === current}
              >
                {index < current ? '✔' : index === current ? '▶' : '○'} {stage}
              </Text>
              <Text dimColor>  {STAGE_EVIDENCE[stage]}</Text>
            </Box>
          ))}

          <Text> </Text>
          <Text bold underline>Gate</Text>
          <Text color={isBlocked ? 'red' : 'green'}>
            {isBlocked ? 'closed: edits outside openspec/ are denied' : 'open'}
          </Text>
          {change.gateReasons.map(reason => (
            <Text key={`gate-${change.name}-${reason}`} color="red" wrap="wrap">  • {reason}</Text>
          ))}
          {change.missing.map(item => (
            <Text key={`missing-${change.name}-${item}`} dimColor wrap="wrap">  ○ missing {item}</Text>
          ))}
          <Text> </Text>
        </Box>
      )}

      <Text bold underline>
        Tasks {progressBar(change.tasksDone, change.tasksTotal)} {change.tasksDone}/{change.tasksTotal}
        {isFiltering ? `  (showing ${tasks.length} of ${change.tasks.length})` : ''}
      </Text>
      {change.tasks.length === 0 ? <Text dimColor>  No tasks yet.</Text> : null}
      {change.tasks.length > 0 && tasks.length === 0 ? <Text dimColor>  No task matches.</Text> : null}
      {tasks.map((task, index) => (
        <Text key={`task-${change.name}-${index}`} dimColor={task.isDone} wrap="truncate-end">
          {task.isDone ? '  [x] ' : '  [ ] '}
          {task.id ?? '?'} {task.text}
        </Text>
      ))}

      <Text> </Text>
      <Text bold underline>
        Specs {change.specs.length} file(s) · {requirementCount} requirement(s) · {scenarioCount} scenario(s)
      </Text>
      {change.specs.length === 0 ? <Text color="red">  No specs yet: the gate has no acceptance criteria.</Text> : null}
      {change.specs.length > 0 && specs.length === 0 ? <Text dimColor>  No spec matches.</Text> : null}
      {specs.map(({ spec, requirements }) => (
        <Box key={`spec-${change.name}-${spec.file}`} flexDirection="column">
          <Box>
            <Text bold>{'  '}{spec.capability}</Text>
            <Text dimColor>  {specPath(spec.file)}</Text>
          </Box>
          {requirements.map((requirement, index) => (
            <Box key={`req-${change.name}-${spec.file}-${index}`}>
              <Text color={requirement.scenarios === 0 ? 'red' : undefined} wrap="truncate-end">
                {'    '}
                {OP_MARK[requirement.op] ?? '•'} {requirement.name}
              </Text>
              <Text dimColor={requirement.scenarios > 0} color={requirement.scenarios === 0 ? 'red' : undefined}>
                {'  '}
                {requirement.scenarios} scenario(s)
              </Text>
            </Box>
          ))}
        </Box>
      ))}

      <Text> </Text>
      <Text bold underline>Findings</Text>
      {change.findings.length === 0 ? <Text dimColor>  None recorded under findings/.</Text> : null}
      {change.findings.length > 0 && findings.length === 0 ? <Text dimColor>  No finding matches.</Text> : null}
      {findings.map(finding => (
        <Box key={`finding-${change.name}-${finding.file}`}>
          <Text color={finding.isOpenCritical ? 'red' : undefined} bold={finding.isOpenCritical}>
            {'  '}
            {(finding.severity ?? 'UNRATED').padEnd(9)}
          </Text>
          <Text dimColor>{(finding.status ?? 'no status').padEnd(12)}</Text>
          <Text wrap="truncate-end">{baseName(finding.file)}</Text>
        </Box>
      ))}

      <Text> </Text>
      <Text bold underline>Recent activity</Text>
      {change.logTail.length === 0 ? <Text dimColor>  The execution log is empty.</Text> : null}
      {change.logTail.length > 0 && rows.length === 0 ? <Text dimColor>  No activity matches.</Text> : null}
      {rows.map((row, index) => (
        <Box key={`log-${change.name}-${index}`}>
          <Text dimColor>{`  ${row.time.slice(11, 19)} `}</Text>
          <Text color={row.kind === 'gate-denied' ? 'red' : 'cyan'}>{row.kind.padEnd(15)}</Text>
          <Text wrap="truncate-end">{row.detail}</Text>
        </Box>
      ))}
    </Box>
  )
}

/** The pane: filter box, every change of the project, and full detail for the ones in view. */
export const detailView = (ui: InputUi, context: PaneContext, actions: PaneActions) => {
  const { Box, Button, Input, Text } = ui
  const { overview, current, query, shown } = context
  const isFiltering = query.trim() !== ''

  return (
    <Box flexDirection="column">
      <Input
        key="filter"
        placeholder="filter changes, tasks, specs, findings"
        value={query}
        onInput={value => actions.search(value)}
        onSubmit={value => actions.search(value)}
      />
      <Box>
        <Button key="clear" label="Clear" onPress={() => actions.search('')} />
        <Text> </Text>
        <Button key="refresh" label="Refresh" onPress={() => actions.refresh()} />
        <Text dimColor>  live: re-reads every few seconds while open</Text>
      </Box>

      <Text> </Text>
      <Text bold underline>Changes ({overview.changes.length})</Text>
      {overview.changes.map(change => {
        const isCurrent = change.name === current.name
        const isShown = shown.includes(change.name)
        const hits = isFiltering ? matchCount(change, query) : null
        const isBlocked = change.gateReasons.length > 0

        return (
          <Box key={`change-${change.name}`}>
            <Button
              key={`focus-${change.name}`}
              label={`${isCurrent ? '▶' : ' '} ${change.name}`}
              onPress={() => actions.focus(change.name)}
            />
            <Text dimColor={hits === 0}>
              {' '}
              {change.stage} {progressBar(change.tasksDone, change.tasksTotal)} {change.tasksDone}/{change.tasksTotal}{' '}
            </Text>
            <Text color={isBlocked ? 'red' : 'green'}>{isBlocked ? 'gate closed' : 'gate open'}</Text>
            {hits === null ? null : <Text color="yellow"> {hits} match(es)</Text>}
            {isCurrent ? null : (
              <Button
                key={`toggle-${change.name}`}
                label={isShown ? 'Hide' : 'Show'}
                onPress={() => actions.toggle(change.name)}
              />
            )}
          </Box>
        )
      })}

      {visibleChanges(overview, current, shown).map(change =>
        changeBlock(ui, change, query, change.name === current.name),
      )}
    </Box>
  )
}
