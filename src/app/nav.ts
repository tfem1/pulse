import {
  Activity,
  BellRing,
  HardDrive,
  LayoutDashboard,
  ListTree,
  Network,
  Settings,
  Thermometer,
  type LucideIcon,
} from 'lucide-react';
import type { TKey } from '@/i18n';

export interface NavItem {
  path: string;
  labelKey: TKey;
  icon: LucideIcon;
}

/** Sidebar order = Ctrl+1 … Ctrl+8 shortcuts. */
export const NAV: NavItem[] = [
  { path: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { path: '/performance', labelKey: 'nav.performance', icon: Activity },
  { path: '/processes', labelKey: 'nav.processes', icon: ListTree },
  { path: '/storage', labelKey: 'nav.storage', icon: HardDrive },
  { path: '/network', labelKey: 'nav.network', icon: Network },
  { path: '/sensors', labelKey: 'nav.sensors', icon: Thermometer },
  { path: '/alerts', labelKey: 'nav.alerts', icon: BellRing },
  { path: '/settings', labelKey: 'nav.settings', icon: Settings },
];

export const MOD_KEY = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl';
