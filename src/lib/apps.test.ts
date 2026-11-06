import { describe, expect, it } from 'vitest';
import { displayName, groupApps } from './apps';
import type { ProcessInfo } from './types';

function proc(
  pid: number,
  parent: number | null,
  name: string,
  extra: Partial<ProcessInfo> = {},
): ProcessInfo {
  return {
    pid,
    parent,
    name,
    user: 'me',
    cpu: 1,
    memory: 100,
    virtualMemory: 0,
    diskReadBps: 0,
    diskWriteBps: 0,
    status: 'sleeping',
    startTime: 0,
    runTime: 0,
    cmd: name,
    exe: `/usr/bin/${name}`,
    threads: 1,
    isSystem: false,
    gui: false,
    title: null,
    ...extra,
  };
}

describe('groupApps', () => {
  const ff = '/usr/lib/firefox/firefox';
  const list = [
    proc(1, null, 'systemd', { isSystem: true, user: 'root' }),
    proc(10, 1, 'gnome-shell'),
    // Firefox: main window + content processes running the same executable.
    proc(100, 10, 'firefox', { exe: ff, gui: true, title: 'GitHub — Mozilla Firefox', cpu: 5, memory: 500 }),
    proc(101, 100, 'Web Content', { exe: ff, gui: true, cpu: 3, memory: 300 }),
    proc(102, 100, 'Web Content', { exe: ff, cpu: 2, memory: 200 }),
    // Terminal with a shell that launched a GUI program: nested in the terminal.
    proc(200, 1, 'gnome-terminal-server', { gui: true, title: 'Terminal' }),
    proc(201, 200, 'bash'),
    proc(202, 201, 'gedit', { gui: true }),
    proc(203, 201, 'sudo', { isSystem: true, user: 'root' }),
    // A CLI program on its own is not an app.
    proc(300, 1, 'cron'),
  ];

  it('groups an app with its helper processes and sums their usage', () => {
    const apps = groupApps(list);
    const firefox = apps.find((a) => a.id === 100)!;
    expect(firefox.name).toBe('firefox');
    expect(firefox.title).toBe('GitHub — Mozilla Firefox');
    expect(firefox.processes.map((p) => p.pid)).toEqual([100, 101, 102]);
    expect(firefox.primary).toEqual([100, 101]);
    expect(firefox.cpu).toBe(10);
    expect(firefox.memory).toBe(1000);
  });

  it('nests apps started from another app and skips system descendants', () => {
    const apps = groupApps(list);
    expect(apps.map((a) => a.id).sort()).toEqual([100, 200]);
    const terminal = apps.find((a) => a.id === 200)!;
    expect(terminal.processes.map((p) => p.pid)).toEqual([200, 201, 202]);
  });

  it('ignores non-GUI processes and survives parent cycles', () => {
    const cyclic = [proc(5, 6, 'a', { gui: true }), proc(6, 5, 'a', { gui: true })];
    const apps = groupApps(cyclic);
    expect(apps.length).toBeLessThanOrEqual(2);
    expect(groupApps([proc(1, null, 'cron')])).toEqual([]);
  });

  it('keeps the children of an app run as root (sudo / administrator)', () => {
    const apps = groupApps([
      proc(1, null, 'systemd', { isSystem: true, user: 'root' }),
      proc(50, 1, 'gparted', { isSystem: true, user: 'root', gui: true }),
      proc(51, 50, 'gpartedbin', { isSystem: true, user: 'root' }),
    ]);
    expect(apps.map((a) => a.processes.map((p) => p.pid))).toEqual([[50, 51]]);
  });

  it('strips .exe for display', () => {
    expect(displayName(proc(1, null, 'chrome.exe'))).toBe('chrome');
    expect(displayName(proc(1, null, 'firefox'))).toBe('firefox');
  });
});
