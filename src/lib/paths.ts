/**
 * Parent directory of a path, for both Windows and Unix paths.
 * Roots are their own parent: "C:\" → "C:\", "/" → "/", "\\srv\share" → "\\srv\share\".
 */
export function parentPath(p: string): string {
  const path = p.trim();
  if (!path) return path;

  // Windows drive paths: C:\, C:\Users\me, C:/Users
  const drive = /^([A-Za-z]:)([\\/].*)?$/.exec(path);
  if (drive) {
    const rest = (drive[2] ?? '').replace(/[\\/]+$/, '');
    const i = Math.max(rest.lastIndexOf('\\'), rest.lastIndexOf('/'));
    return i <= 0 ? `${drive[1]}\\` : `${drive[1]}${rest.slice(0, i)}`;
  }

  // UNC paths: \\server\share\dir
  const unc = /^(\\\\[^\\]+\\[^\\]+)(\\.*)?$/.exec(path);
  if (unc) {
    const rest = (unc[2] ?? '').replace(/\\+$/, '');
    const i = rest.lastIndexOf('\\');
    return i <= 0 ? `${unc[1]}\\` : `${unc[1]}${rest.slice(0, i)}`;
  }

  // Unix paths
  const trimmed = path.replace(/\/+$/, '');
  const i = trimmed.lastIndexOf('/');
  return i <= 0 ? '/' : trimmed.slice(0, i);
}
