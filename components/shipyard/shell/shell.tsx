'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, BookOpen, CircleHelp, ShieldCheck, ScrollText, Moon, Sun, Users } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { getApprovals, USE_MOCKS } from '../api';
import { useData } from '../use-data';
import { Flap } from '../flap';
import { ActingAs } from '../acting-as';

const NAV = [
  { href: '/agents', label: 'Agents', Icon: Bot },
  { href: '/library', label: 'Library', Icon: BookOpen },
  { href: '/teams', label: 'Teams', Icon: Users },
  { href: '/approvals', label: 'Approvals', Icon: ShieldCheck },
  { href: '/audit', label: 'Audit', Icon: ScrollText },
] as const;

export const PERSONA = { name: 'Maya Ortiz', role: 'Platform', org: 'Lone Star Community CU' } as const;

/** Board glyph: two flap leaves with the split between them. */
function BoardGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
      <rect x="1" y="1" width="18" height="8.5" rx="1.5" fill="var(--signal)" />
      <rect x="1" y="10.5" width="18" height="8.5" rx="1.5" fill="var(--signal)" opacity="0.72" />
    </svg>
  );
}

function Wordmark() {
  return (
    <Link href="/agents" className="flex items-center gap-2.5 rounded-sm">
      <BoardGlyph />
      <span className="board-title text-[1.75rem] tracking-[0.01em] uppercase">Shipyard</span>
    </Link>
  );
}

/** Local time on the board, like every concourse display. Client-only so SSR never disagrees with the clock. */
function BoardClock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    setNow(fmt());
    const id = window.setInterval(() => setNow(fmt()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  if (!now) return <span className="h-[1.6rem]" aria-hidden />;
  return <Flap text={now} tone="signal" className="text-[1.3rem]" label={`Local time ${now}`} />;
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
      className="grid size-9 place-items-center rounded-md text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-signal focus-visible:outline-none"
      aria-label="Toggle dark mode"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}


function HelpLink() {
  return (
    <Link
      href="/"
      className="grid size-9 place-items-center rounded-md text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-signal focus-visible:outline-none"
      aria-label="How Shipyard works"
      title="How Shipyard works"
    >
      <CircleHelp className="size-4" aria-hidden />
    </Link>
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
              'status-word flex items-center gap-2.5 rounded-sm transition-colors focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar focus-visible:outline-none',
              compact ? 'shrink-0 px-2.5 py-2 text-[0.9375rem]' : 'px-3 py-2.5 text-[1.0625rem]',
              active
                ? 'bg-signal text-signal-foreground'
                : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground',
            )}
          >
            <Icon className="size-[1.1rem] shrink-0" strokeWidth={2.25} aria-hidden />
            <span>{label}</span>
            {href === '/approvals' && pending > 0 && (
              <span
                className={cn(
                  'ml-auto grid min-w-6 place-items-center rounded-sm px-1 py-0.5 text-sm tabular-nums',
                  active ? 'bg-signal-foreground text-signal' : 'bg-warn-lamp text-signal-foreground',
                )}
              >
                {pending}
                <span className="sr-only"> pending</span>
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
        <span className="lamp text-sidebar-muted" aria-hidden />
        <span>Demo data (offline mode)</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs text-sidebar-muted">
      <span className={cn('lamp', apiDown ? 'text-warn-lamp' : 'text-pass-lamp')} data-blink={apiDown ? 'true' : undefined} aria-hidden />
      <span>
        Production · <span className="text-sidebar-foreground">{apiDown ? 'API unreachable' : 'Up'}</span>
      </span>
    </div>
  );
}

function Persona() {
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-9 place-items-center rounded-sm bg-board-cell font-display text-base font-extrabold text-board-ink" aria-hidden>MO</span>
      <div className="leading-tight">
        <div className="text-sm font-bold">{PERSONA.name}</div>
        <div className="text-xs text-sidebar-muted">{PERSONA.role}</div>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { count: pending, apiDown } = usePending();
  return (
    <div className="sy-root flex min-h-screen w-full flex-col bg-background text-foreground lg:flex-row">
      <a
        href="#main"
        className="sr-only z-50 rounded-sm bg-signal px-3 py-2 font-bold text-signal-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      {/* Desktop rail: the board */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex flex-col gap-1 border-b border-sidebar-border px-5 pt-6 pb-5">
          <Wordmark />
          <p className="text-xs text-sidebar-muted">{PERSONA.org}</p>
        </div>
        <nav className="flex flex-col gap-1 p-3" aria-label="Main">
          <NavLinks pending={pending} />
        </nav>
        <div className="mt-auto flex flex-col gap-4 border-t border-sidebar-border px-5 py-4">
          <ActingAs />
          <div className="flex items-center justify-between gap-2">
            <ProdStatus apiDown={apiDown} />
            <BoardClock />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Persona />
            <div className="flex items-center">
              <HelpLink />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </aside>
      {/* Mobile top bar: the same board */}
      <header className="sticky top-0 z-30 flex flex-col gap-2 bg-sidebar px-4 pt-2 pb-2.5 text-sidebar-foreground shadow-(--shadow-board) lg:hidden">
        <div className="flex h-10 items-center justify-between gap-3">
          <Wordmark />
          <div className="flex items-center gap-2">
            <ProdStatus apiDown={apiDown} />
            <HelpLink />
            <ThemeToggle />
          </div>
        </div>
        <ActingAs />
        <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none]" aria-label="Main">
          <NavLinks pending={pending} compact />
        </nav>
      </header>
      <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
        <div className="mx-auto w-full max-w-[1440px]">{children}</div>
      </main>
    </div>
  );
}
