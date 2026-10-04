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
}

declare module 'claude-code' {
  interface PluginState {
    'openspec-governance': { snapshot: Snapshot | null; focus: Focus | null }
  }
}
