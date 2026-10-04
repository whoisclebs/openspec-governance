import type { On } from 'claude-code'

export type Files = Record<string, string>

const trim = (path: string): string => path.replace(/\/$/, '')

/**
 * Stands in for the engine's file system beneath the plugin: `files` maps an
 * absolute path to its text, and writes made by the plugin or by the faked
 * Write/Edit tools land in the same map.
 */
export const memoryFs = (on: On, files: Files, cwd: string) => {
  const isDir = (path: string) => Object.keys(files).some(file => file.startsWith(`${trim(path)}/`))

  on('session.cwd', async () => ({ value: cwd }))

  on('fs.exists', async (_$, e) => ({ value: e.path in files || isDir(e.path) }))

  on('fs.read', async (_$, e) => {
    const text = files[e.path]
    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })

  on('fs.write', async (_$, e) => {
    files[e.path] = e.text
    return { value: undefined }
  })

  on('fs.list', async (_$, e) => {
    const prefix = `${trim(e.path)}/`
    const names = new Map<string, 'file' | 'dir'>()

    for (const file of Object.keys(files)) {
      if (!file.startsWith(prefix)) continue
      const [name, ...deeper] = file.slice(prefix.length).split('/')
      if (name !== undefined) names.set(name, deeper.length > 0 ? 'dir' : 'file')
    }

    const value = [...names].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: 0, isLink: false }))
    return { value }
  })

  on('fs.stat', async (_$, e) => {
    const text = files[e.path]
    if (text !== undefined) return { value: { kind: 'file' as const, size: text.length, mtimeMs: 0, isLink: false } }
    if (isDir(e.path)) return { value: { kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false } }
    return { deny: `ENOENT: ${e.path}` }
  })

  on('tool.call', { tool: 'Write' }, async (_$, e) => {
    const originalFile = files[e.file_path] ?? null
    files[e.file_path] = e.content

    return {
      result: {
        type: originalFile === null ? ('create' as const) : ('update' as const),
        filePath: e.file_path,
        content: e.content,
        structuredPatch: [],
        originalFile,
      },
    }
  })

  on('tool.call', { tool: 'Edit' }, async (_$, e) => {
    const originalFile = files[e.file_path] ?? ''
    files[e.file_path] = originalFile.replace(e.old_string, e.new_string)

    return {
      result: {
        filePath: e.file_path,
        oldString: e.old_string,
        newString: e.new_string,
        originalFile,
        structuredPatch: [],
        userModified: false,
        replaceAll: false,
      },
    }
  })

  on('tool.call', { tool: 'Read' }, async (_$, e) => {
    const content = files[e.file_path] ?? ''

    return {
      result: {
        type: 'text' as const,
        file: { filePath: e.file_path, content, numLines: 1, startLine: 1, totalLines: 1 },
      },
    }
  })
}
