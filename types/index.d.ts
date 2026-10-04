export type Stage =
  | 'none'
  | 'discovery'
  | 'proposed'
  | 'designed'
  | 'specified'
  | 'planned'
  | 'ready-to-implement'
  | 'implemented'
  | 'verified'
  | 'done'

export type Focus = { root: string; change: string }

export type TaskRow = { id: string | null; text: string; isDone: boolean }

export type FindingRow = {
  file: string
  severity: string | null
  status: string | null
  isOpenCritical: boolean
}

export type LogRow = { time: string; kind: string; detail: string }

export type Snapshot = {
  root: string
  change: string
  stage: Stage
  /** Artifacts the stage matrix still lacks, in order. */
  missing: string[]
  tasksDone: number
  tasksTotal: number
  openCritical: number
  /** Reasons the fail-closed gate would deny an edit right now. */
  gateReasons: string[]
  tasks: TaskRow[]
  findings: FindingRow[]
  /** The newest execution-log rows, oldest first. */
  logTail: LogRow[]
}

declare module 'claude-code' {
  interface PluginState {
    'openspec-governance': { snapshot: Snapshot | null; focus: Focus | null }
  }
}
