import type { EngineInterface } from 'claude-code'

import type { Snapshot } from '../../types'
import { STAGE_EVIDENCE, STAGE_ORDER } from './stage'

/** The element table `$.ui.resolve(e)` returns; the hooks module hands it in. */
export type Ui = ReturnType<EngineInterface['ui']['resolve']>

const BAR_WIDTH = 10
const MAX_TASKS = 14

export const progressBar = (done: number, total: number): string => {
  const filled = total === 0 ? 0 : Math.round((done / total) * BAR_WIDTH)
  return '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled)
}

const baseName = (path: string): string => path.split('/').pop() ?? path

/** One row above the prompt: change, stage, progress and gate. */
export const bandView = (ui: Ui, snap: Snapshot, onDetails: () => void) => {
  const { Box, Button, Text } = ui
  const isBlocked = snap.gateReasons.length > 0
  const hint = snap.missing[0]

  return (
    <Box>
      <Text bold>OpenSpec </Text>
      <Text>{snap.change}</Text>
      <Text dimColor> · </Text>
      <Text color="cyan">{snap.stage}</Text>
      <Text dimColor> · </Text>
      <Text>
        {progressBar(snap.tasksDone, snap.tasksTotal)} {snap.tasksDone}/{snap.tasksTotal}
      </Text>
      <Text dimColor> · </Text>
      <Text color={isBlocked ? 'red' : 'green'}>
        {isBlocked ? `gate closed (${snap.gateReasons.length})` : 'gate open'}
      </Text>
      {snap.openCritical > 0 ? <Text color="red"> · {snap.openCritical} CRITICAL</Text> : null}
      {hint === undefined ? null : <Text dimColor> · next: {hint}</Text>}
      <Text> </Text>
      <Button key="details" label="Details" onPress={onDetails} />
    </Box>
  )
}

/** The pane: stage checklist, gate, missing artifacts, tasks, findings and the log tail. */
export const detailView = (ui: Ui, snap: Snapshot, onRefresh: () => void) => {
  const { Box, Button, Text } = ui
  const current = (STAGE_ORDER as readonly string[]).indexOf(snap.stage)
  const isBlocked = snap.gateReasons.length > 0
  const hiddenTasks = Math.max(0, snap.tasks.length - MAX_TASKS)

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>{snap.change}</Text>
        <Text dimColor>  openspec/changes/{snap.change}</Text>
      </Box>

      <Text> </Text>
      <Text bold underline>Stage</Text>
      {STAGE_ORDER.map((stage, index) => (
        <Box key={`stage-${stage}`}>
          <Text color={index < current ? 'green' : index === current ? 'cyan' : undefined} dimColor={index > current} bold={index === current}>
            {index < current ? '✔' : index === current ? '▶' : '○'} {stage}
          </Text>
          <Text dimColor>  {STAGE_EVIDENCE[stage]}</Text>
        </Box>
      ))}

      <Text> </Text>
      <Text bold underline>Gate</Text>
      <Text color={isBlocked ? 'red' : 'green'}>{isBlocked ? 'closed: edits outside openspec/ are denied' : 'open'}</Text>
      {snap.gateReasons.map(reason => (
        <Text key={`gate-${reason}`} color="red" wrap="wrap">  • {reason}</Text>
      ))}
      {snap.missing.map(item => (
        <Text key={`missing-${item}`} dimColor wrap="wrap">  ○ missing {item}</Text>
      ))}

      <Text> </Text>
      <Text bold underline>Tasks</Text>
      <Text>
        {progressBar(snap.tasksDone, snap.tasksTotal)} {snap.tasksDone}/{snap.tasksTotal}
      </Text>
      {snap.tasks.length === 0 ? <Text dimColor>  No tasks yet.</Text> : null}
      {snap.tasks.slice(0, MAX_TASKS).map((task, index) => (
        <Text key={`task-${index}`} dimColor={task.isDone} wrap="truncate-end">
          {task.isDone ? '  [x] ' : '  [ ] '}
          {task.id ?? '?'} {task.text}
        </Text>
      ))}
      {hiddenTasks > 0 ? <Text dimColor>  … and {hiddenTasks} more in tasks.md</Text> : null}

      <Text> </Text>
      <Text bold underline>Findings</Text>
      {snap.findings.length === 0 ? <Text dimColor>  None recorded under findings/.</Text> : null}
      {snap.findings.map(finding => (
        <Box key={`finding-${finding.file}`}>
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
      {snap.logTail.length === 0 ? <Text dimColor>  The execution log is empty.</Text> : null}
      {snap.logTail.map((row, index) => (
        <Box key={`log-${index}`}>
          <Text dimColor>{`  ${row.time.slice(11, 19)} `}</Text>
          <Text color={row.kind === 'gate-denied' ? 'red' : 'cyan'}>{row.kind.padEnd(15)}</Text>
          <Text wrap="truncate-end">{row.detail}</Text>
        </Box>
      ))}

      <Text> </Text>
      <Button key="refresh" label="Refresh" onPress={onRefresh} />
    </Box>
  )
}
