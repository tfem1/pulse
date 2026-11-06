/**
 * Group processes into applications, like Task Manager's "Apps" list.
 *
 * The backend flags user-facing processes (`gui`: owns a window on Windows,
 * uses a GUI toolkit on Linux). Each one is traced up to the topmost
 * ancestor running the same program (browsers and Electron apps fork copies
 * of themselves), which becomes the app's root. The app is that root plus its
 * descendants (minus system processes of another user). An app started from
 * another app (e.g. from a terminal) is grouped under the outer one.
 */
import type { ProcessInfo } from './types';

export interface AppGroup {
  /** Root PID; stable while the app runs. */
  id: number;
  name: string;
  /** Main window title, when known. */
  title: string | null;
  root: ProcessInfo;
  /** Every process of the app, root first. */
  processes: ProcessInfo[];
  /** Window-owning processes, asked to close first by "End task". */
  primary: number[];
  cpu: number;
  memory: number;
  diskBps: number;
  suspended: boolean;
}

/** "chrome.exe" → "chrome"; keeps other names as they are. */
export function displayName(p: ProcessInfo): string {
  return p.name.replace(/\.exe$/i, '');
}

export function groupApps(list: ProcessInfo[]): AppGroup[] {
  const byPid = new Map(list.map((p) => [p.pid, p]));
  const children = new Map<number, ProcessInfo[]>();
  for (const p of list) {
    if (p.parent != null && p.parent !== p.pid && byPid.has(p.parent)) {
      const kids = children.get(p.parent) ?? [];
      kids.push(p);
      children.set(p.parent, kids);
    }
  }
  const parentOf = (p: ProcessInfo) =>
    p.parent != null && p.parent !== p.pid ? byPid.get(p.parent) : undefined;
  const sameProgram = (a: ProcessInfo, b: ProcessInfo) =>
    a.exe && b.exe ? a.exe === b.exe : a.name === b.name;

  // 1. Root of each user-facing process.
  const roots = new Map<number, ProcessInfo>();
  for (const p of list) {
    if (!p.gui) continue;
    let root = p;
    const seen = new Set([root.pid]);
    for (let parent = parentOf(root); parent; parent = parentOf(root)) {
      if (seen.has(parent.pid) || !sameProgram(parent, root)) break;
      seen.add(parent.pid);
      root = parent;
    }
    roots.set(root.pid, root);
  }

  // 2. Keep only outermost roots (apps launched from another app nest in it).
  const nested = (root: ProcessInfo) => {
    const seen = new Set([root.pid]);
    for (let a = parentOf(root); a && !seen.has(a.pid); a = parentOf(a)) {
      if (roots.has(a.pid)) return true;
      seen.add(a.pid);
    }
    return false;
  };

  const apps: AppGroup[] = [];
  for (const root of roots.values()) {
    if (nested(root)) continue;
    // 3. Root + its descendants, except system processes of another user
    //    (e.g. `sudo` started from a terminal stays out of the terminal app).
    const processes: ProcessInfo[] = [];
    const queue = [root];
    const seen = new Set<number>();
    while (queue.length) {
      const p = queue.shift()!;
      if (seen.has(p.pid)) continue;
      seen.add(p.pid);
      if (p !== root && p.isSystem && p.user !== root.user) continue;
      processes.push(p);
      queue.push(...(children.get(p.pid) ?? []));
    }
    const title = root.title ?? processes.find((p) => p.title)?.title ?? null;
    apps.push({
      id: root.pid,
      name: displayName(root),
      title,
      root,
      processes,
      primary: processes.filter((p) => p.gui).map((p) => p.pid),
      cpu: Math.min(
        100,
        processes.reduce((a, p) => a + p.cpu, 0),
      ),
      memory: processes.reduce((a, p) => a + p.memory, 0),
      diskBps: processes.reduce((a, p) => a + p.diskReadBps + p.diskWriteBps, 0),
      suspended: processes.every((p) => p.status === 'suspended' || p.status === 'stopped'),
    });
  }
  return apps;
}
