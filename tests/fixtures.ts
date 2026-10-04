export const ROOT = '/work/app'
export const CHANGE = `${ROOT}/openspec/changes/add-search`

export const PROPOSAL = '## Why\n\nUsers cannot search.\n\n## What Changes\n\n- Add search.\n'
export const DESIGN = '## Context\n\nc\n\n## Decisions\n\nd\n\n## Migration Plan\n\nnone\n'
export const SPEC = '### Requirement: Search\n\n#### Scenario: Finds a match\n\n- **WHEN** a query matches\n- **THEN** it is listed\n'
export const TASKS = '## 1. Build\n\n- [ ] 1.1 Add the index in `search.go`\n- [ ] 1.2 Add tests\n'

/** A project with an active change that is ready to implement. */
export const readyProject = (): Record<string, string> => ({
  [`${CHANGE}/proposal.md`]: PROPOSAL,
  [`${CHANGE}/design.md`]: DESIGN,
  [`${CHANGE}/specs/search/spec.md`]: SPEC,
  [`${CHANGE}/tasks.md`]: TASKS,
  [`${ROOT}/src/search.go`]: 'package app\n',
})

export const criticalFinding = (status: string): string =>
  `---\nseverity: CRITICAL\nstatus: ${status}\n---\n\n# Injection\n\nEvidence.\n`
