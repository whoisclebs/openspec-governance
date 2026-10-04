/** POSIX path helpers: the module runs without Node, so there is no `path`. */

export const normalizePath = (path: string): string => {
  const isAbsolute = path.startsWith('/')
  const kept: string[] = []

  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      kept.pop()
      continue
    }
    kept.push(part)
  }

  return (isAbsolute ? '/' : '') + kept.join('/')
}

export const joinPath = (...parts: string[]): string => normalizePath(parts.join('/'))

export const resolvePath = (cwd: string, path: string): string =>
  normalizePath(path.startsWith('/') ? path : `${cwd}/${path}`)

export const dirname = (path: string): string => {
  const cut = path.lastIndexOf('/')
  if (cut < 0) return '.'
  return cut === 0 ? '/' : path.slice(0, cut)
}

export const isInside = (dir: string, path: string): boolean =>
  path === dir || path.startsWith(dir.endsWith('/') ? dir : `${dir}/`)

/** `path` relative to `dir`; `path` itself when it is not inside `dir`. */
export const relativeTo = (dir: string, path: string): string =>
  isInside(dir, path) ? path.slice(dir.length).replace(/^\//, '') : path
