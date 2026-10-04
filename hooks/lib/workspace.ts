import type { ChangeFiles, SpecFile } from './artifacts'
import { dirname, isInside, joinPath, relativeTo } from './paths'

/** The slice of `$.fs` this module reads; the hooks module hands it in, since `$` stays there. */
export type Fs = {
  read: (path: string) => Promise<string | { base64: string }>
  list: (path: string) => Promise<readonly { name: string; kind: 'file' | 'dir' | 'other' }[]>
  exists: (path: string) => Promise<boolean>
  stat: (path: string) => Promise<{ mtimeMs: number }>
}

export const ARCHIVE = 'archive'

const MAX_WALK = 40
const MAX_SPEC_DEPTH = 3

const readText = (fs: Fs, path: string): Promise<string | null> =>
  fs.read(path).then(
    text => (typeof text === 'string' ? text : null),
    () => null,
  )

const listDir = (fs: Fs, path: string) => fs.list(path).catch(() => [])

export const changesDir = (root: string): string => joinPath(root, 'openspec', 'changes')

/** Walks up from `startDir` to the nearest folder holding `openspec/changes`. */
export const findProjectRoot = async (fs: Fs, startDir: string): Promise<string | null> => {
  let dir = startDir

  for (let step = 0; step < MAX_WALK; step += 1) {
    if (await fs.exists(changesDir(dir)).catch(() => false)) return dir

    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }

  return null
}

/** The change a path sits in (`<root>/openspec/changes/<name>/...`), never the archive. */
export const changeNameOf = (root: string, path: string): string | null => {
  const dir = changesDir(root)
  if (!isInside(dir, path)) return null

  const name = relativeTo(dir, path).split('/')[0] ?? ''
  return name === '' || name === ARCHIVE || name.startsWith('.') ? null : name
}

export const listActiveChanges = async (fs: Fs, root: string): Promise<string[]> => {
  const entries = await listDir(fs, changesDir(root))

  return entries
    .filter(entry => entry.kind === 'dir' && entry.name !== ARCHIVE && !entry.name.startsWith('.'))
    .map(entry => entry.name)
}

const collectMarkdown = async (fs: Fs, dir: string, depth: number): Promise<SpecFile[]> => {
  const found: SpecFile[] = []

  for (const entry of await listDir(fs, dir)) {
    const path = joinPath(dir, entry.name)

    if (entry.kind === 'dir' && depth < MAX_SPEC_DEPTH) {
      found.push(...(await collectMarkdown(fs, path, depth + 1)))
    } else if (entry.kind === 'file' && entry.name.endsWith('.md')) {
      found.push({ path, content: (await readText(fs, path)) ?? '' })
    }
  }

  return found
}

export const loadChange = async (fs: Fs, root: string, name: string): Promise<ChangeFiles> => {
  const dir = joinPath(changesDir(root), name)

  return {
    name,
    isArchived: false,
    proposal: await readText(fs, joinPath(dir, 'proposal.md')),
    design: await readText(fs, joinPath(dir, 'design.md')),
    tasks: await readText(fs, joinPath(dir, 'tasks.md')),
    specs: await collectMarkdown(fs, joinPath(dir, 'specs'), 0),
  }
}

const newestTouch = async (fs: Fs, dir: string): Promise<number> => {
  const stamps = await Promise.all(
    ['proposal.md', 'design.md', 'tasks.md'].map(file =>
      fs.stat(joinPath(dir, file)).then(
        stat => stat.mtimeMs,
        () => 0,
      ),
    ),
  )

  return Math.max(0, ...stamps)
}

/**
 * Picks the change an edit belongs to: the one its path names, else the only
 * active one, else the focused one, else the most recently touched.
 */
export const pickChange = async (
  fs: Fs,
  root: string,
  path: string,
  focused: string | undefined,
): Promise<string | null> => {
  const named = changeNameOf(root, path)
  if (named !== null) return named

  const active = await listActiveChanges(fs, root)
  if (active.length <= 1) return active[0] ?? null
  if (focused !== undefined && active.includes(focused)) return focused

  const stamped = await Promise.all(
    active.map(async name => ({ name, at: await newestTouch(fs, joinPath(changesDir(root), name)) })),
  )

  return stamped.sort((a, b) => b.at - a.at)[0]?.name ?? null
}
