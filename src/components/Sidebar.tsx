'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  FileText, Package, HardHat, Receipt, BarChart3, Folder, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useEstimate } from '@/lib/estimate/EstimateContext';

const NARROW_VIEWPORT_QUERY = '(max-width: 768px)';

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { projectId, flushSave } = useEstimate();

  const navItems = [
    { href: `/project/${projectId}`, label: 'Cover Info', icon: FileText },
    { href: `/project/${projectId}/materials`, label: 'Materials', icon: Package },
    { href: `/project/${projectId}/labor`, label: 'Labor', icon: HardHat },
    { href: `/project/${projectId}/pass-throughs`, label: 'Pass Throughs', icon: Receipt },
    { href: `/project/${projectId}/summary`, label: 'Executive Summary', icon: BarChart3 },
  ];

  // Auto-collapse to reclaim width on tablet/narrow viewports. Only ever collapses
  // automatically (on mount, and when resizing into the narrow range) — it never
  // force-expands, so a manual expand is respected until the user collapses again.
  useEffect(() => {
    const mql = window.matchMedia(NARROW_VIEWPORT_QUERY);
    if (mql.matches) setCollapsed(true);
    function handleChange(e: MediaQueryListEvent) {
      if (e.matches) setCollapsed(true);
    }
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  async function handleAllProjectsClick() {
    try {
      await flushSave();
    } catch (error) {
      // Don't trap the user on the page just because the save failed — at worst this loses the
      // last debounce window's edit, and the failed draft is still retried by EstimateContext's
      // own retry path (a later flushSave() or edit) independent of this navigation.
      console.error('Failed to save before navigating:', error);
    }
    router.push('/projects');
  }

  return (
    <nav
      className={cn(
        'flex flex-col bg-navy text-white transition-all duration-200',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-center gap-2 h-12 border-b border-white/10 hover:bg-navy-2 text-sm"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight className="w-5 h-5" aria-hidden="true" /> : (
          <>
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            Collapse
          </>
        )}
      </button>
      <ul className="flex-1 py-2">
        {navItems.map((item) => {
          const active = item.href === `/project/${projectId}`
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 text-sm font-body transition-colors',
                  collapsed && 'justify-center px-0',
                  active ? 'bg-navy-2 border-l-4 border-red text-white' : 'text-white/70 hover:bg-navy-2 hover:text-white',
                )}
                title={collapsed ? item.label : undefined}
                aria-label={collapsed ? item.label : undefined}
              >
                <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={handleAllProjectsClick}
            className={cn(
              'flex items-center gap-3 px-4 py-3 text-sm font-body transition-colors w-full text-left',
              collapsed && 'justify-center px-0',
              'text-white/70 hover:bg-navy-2 hover:text-white',
            )}
            title={collapsed ? 'All Projects' : undefined}
            aria-label={collapsed ? 'All Projects' : undefined}
          >
            <Folder className="w-5 h-5 shrink-0" aria-hidden="true" />
            {!collapsed && <span>All Projects</span>}
          </button>
        </li>
      </ul>
    </nav>
  );
}
