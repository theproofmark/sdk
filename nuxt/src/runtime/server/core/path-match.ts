export function isPathProtected(pathname: string, patterns: string[]): boolean {
  if (!patterns || patterns.length === 0) return false
  return patterns.some(p => matchPath(pathname, p))
}

export function isPathExcluded(pathname: string, patterns: string[]): boolean {
  if (!patterns || patterns.length === 0) return false
  return patterns.some(p => matchPath(pathname, p))
}

export function matchPath(pathname: string, pattern: string): boolean {
  if (pattern === pathname) return true
  if (pattern.includes('*')) {
    const regex = new RegExp(
      '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
    )
    return regex.test(pathname)
  }
  return false
}
