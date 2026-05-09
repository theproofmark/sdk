/**
 * Glob-style path matcher with `*` wildcard. `*` matches any character
 * (including `/`) so `/admin/*` matches `/admin/foo/bar`.
 */

const SPECIAL_CHARS = /[.+?^${}()|[\]\\]/g;

export function matchPath(pathname: string, pattern: string): boolean {
  if (!pattern) return false;
  if (pattern === pathname) return true;
  if (!pattern.includes('*')) return false;

  const escaped = pattern.replace(SPECIAL_CHARS, '\\$&').replace(/\*/g, '.*');
  const regex = new RegExp(`^${escaped}$`);
  return regex.test(pathname);
}

export function isPathProtected(pathname: string, patterns: string[] = []): boolean {
  if (!patterns.length) return false;
  return patterns.some((pattern) => matchPath(pathname, pattern));
}

export function isPathExcluded(pathname: string, patterns: string[] = []): boolean {
  if (!patterns.length) return false;
  return patterns.some((pattern) => matchPath(pathname, pattern));
}
