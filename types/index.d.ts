export type Stage =
  | 'none'
  | 'proposed'
  | 'designed'
  | 'specified'
  | 'ready-to-implement'
  | 'implemented'
  | 'done'

export type Focus = { root: string; change: string }

export type TaskRow = { id: string | null; text: string; isDone: boolean }

export type LogRow = { time: string; kind: string; detail: string }

export type RequirementRow = {
  name: string
  /** ADDED, MODIFIED, REMOVED or RENAMED in a delta spec; SPEC in a plain one. */
  op: string
  scenarios: number
}

export type SpecRow = { capability: string; file: string; requirements: RequirementRow[] }

/** One active change, as the band and the pane read it. */
export type ChangeInfo = {
  name: string
  stage: Stage
  /** Artifacts the stage matrix still lacks, in order. */
  missing: string[]
  tasksDone: number
  tasksTotal: number
  /** Reasons the fail-closed gate would deny an edit right now. */
  gateReasons: string[]
  tasks: TaskRow[]
  specs: SpecRow[]
  /** The newest execution-log rows, oldest first. */
  logTail: LogRow[]
}

/** Every active change of one project. */
export type Overview = { root: string; changes: ChangeInfo[] }

declare module 'claude-code' {
  interface PluginState {
    'openspec-governance': {
      overview: Overview | null
      focus: Focus | null
      /** The pane's filter box. */
      query: string
      /** Names of the non-focused changes the pane also shows in full. */
      shown: string[]
    }
  }
}
