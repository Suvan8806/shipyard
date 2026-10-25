'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, BookOpen, ShieldCheck, ScrollText, Moon, Sun } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { getApprovals, USE_MOCKS } from '../api';
import { useData } from '../use-data';

const NAV = [
  { href: '/agents', label: 'Agents', Icon: Bot },
  { href: '/library', label: 'Library', Icon: BookOpen },
  { href: '/approvals', label: 'Approvals', Icon: ShieldCheck },
  { href: '/audit', label: 'Audit', Icon: ScrollText },
] as const;

export const PERSONA = { name: 'Maya Ortiz', role: 'Platform', org: 'Lone Star Community CU' } as const;

/** Tag glyph: a rounded tag with an eyelet (design/direction.md 7.0). */
function TagGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="1.5" y="3" width="13" height="10" rx="2" />
      <circle cx="5" cy="8" r="1.4" />
    </svg>
  );
}

function Wordmark() {
  return (
    <Link href="/agents" className="flex items-center gap-2 text-lg font-bold tracking-tight">
      <TagGlyph />
      <span>Shipyard</span>
    </Link>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);
  const toggle = () => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('sy-theme', next ? 'dark' : 'light');
    } catch {
      /* storage blocked: theme just won't persist */
    }
    setDark(next);
  };
  return (
    <button
      type="button"
      onClick={toggle}
      className="grid size-8 place-items-center rounded-md text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
      aria-label="Toggle dark mode"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

function usePending(): { count: number; apiDown: boolean } {
  const { data, error } = useData('pending-approvals', () => getApprovals('pending'), { pollMs: 5000 });
  return { count: data?.length ?? 0, apiDown: !!error };
}

function NavLinks({ pending, compact }: { pending: number; compact?: boolean }) {
  const pathname = usePathname();
  return (
    <>
      {NAV.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`) || (href === '/agents' && pathname.startsWith('/runs'));
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2 rounded-md text-sm font-medium transition-colors',
              compact ? 'px-2.5 py-1.5' : 'px-3 py-2',
              active
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className={cn(compact && 'sr-only sm:not-sr-only')}>{label}</span>
            {href === '/approvals' && pending > 0 && (
              <span className="ml-auto rounded-sm bg-sidebar-primary px-1.5 text-2xs font-semibold tabular-nums text-sidebar-primary-foreground">
                {pending}
              </span>
            )}
          </Link>
        );
      })}
    </>
  );
}

function ProdStatus({ apiDown }: { apiDown: boolean }) {
  if (USE_MOCKS) {
    return (
      <div className="flex items-center gap-2 text-xs text-sidebar-muted">
        <span className="size-2 rounded-full bg-sidebar-muted" aria-hidden />
        <span>Demo data (offline mode)</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs text-sidebar-muted">
      <span className={cn('size-2 rounded-full', apiDown ? 'bg-warn-solid' : 'bg-pass-solid')} aria-hidden />
      <span>
        Production · <span className="text-sidebar-foreground">{apiDown ? 'API unreachable' : 'Up'}</span>
      </span>
    </div>
  );
}

function Persona() {
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-8 place-items-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">MO</span>
      <div className="leading-tight">
        <div className="text-sm font-medium">{PERSONA.name}</div>
        <div className="text-xs text-sidebar-muted">{PERSONA.role} · {PERSONA.org}</div>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { count: pending, apiDown } = usePending();
  return (
    <div className="sy-root flex min-h-screen w-full flex-col bg-background text-foreground lg:flex-row">
      {/* Desktop rail: committed Notice-blue field */}
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col gap-6 bg-sidebar p-4 text-sidebar-foreground lg:flex">
        <Wordmark />
        <nav className="flex flex-col gap-1" aria-label="Main">
          <NavLinks pending={pending} />
        </nav>
        <div className="mt-auto flex flex-col gap-4">
          <ProdStatus apiDown={apiDown} />
          <div className="flex items-center justify-between gap-2">
            <Persona />
            <ThemeToggle />
          </div>
        </div>
      </aside>
      {/* Mobile top bar in the same field */}
      <header className="sticky top-0 z-30 flex flex-col gap-1.5 bg-sidebar px-4 py-2 text-sidebar-foreground lg:hidden">
        <div className="flex h-10 items-center justify-between">
          <Wordmark />
          <div className="flex items-center gap-2">
            <ProdStatus apiDown={apiDown} />
            <ThemeToggle />
          </div>
        </div>
        <nav className="-mx-1 flex gap-1" aria-label="Main">
          <NavLinks pending={pending} compact />
        </nav>
      </header>
      <main className="min-w-0 flex-1 px-4 py-6 lg:px-6 lg:py-8">{children}</main>
    </div>
  );
}
