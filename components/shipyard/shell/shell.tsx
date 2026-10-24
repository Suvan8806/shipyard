'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, BookOpen, ShieldCheck, ScrollText, Moon, Sun, Anchor } from 'lucide-react';
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

function Wordmark() {
  return (
    <Link href="/agents" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-7 place-items-center rounded-lg bg-foreground text-background">
        <Anchor className="size-4" aria-hidden />
      </span>
      <span className="text-lg">Shipyard</span>
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
      className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label="Toggle dark mode"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

function usePendingCount(): number {
  const { data } = useData('pending-approvals', () => getApprovals('pending'), { pollMs: 5000 });
  return data?.length ?? 0;
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
              'flex items-center gap-2 rounded-lg text-sm font-medium transition-colors',
              compact ? 'px-2.5 py-1.5' : 'px-3 py-2',
              active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className={cn(compact && 'sr-only sm:not-sr-only')}>{label}</span>
            {href === '/approvals' && pending > 0 && (
              <span className="sy-pill-amber ml-auto rounded-full border px-1.5 text-xs font-semibold tabular-nums">{pending}</span>
            )}
          </Link>
        );
      })}
    </>
  );
}

function ProdStatus() {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="sy-pulse-dot size-2 rounded-full" style={{ background: 'var(--sy-green)' }} aria-hidden />
      <span>Production healthy{USE_MOCKS ? ' · demo data' : ''}</span>
    </div>
  );
}

function Persona() {
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-8 place-items-center rounded-full bg-[var(--sy-accent)] text-xs font-semibold text-white">MO</span>
      <div className="leading-tight">
        <div className="text-sm font-medium">{PERSONA.name}</div>
        <div className="text-xs text-muted-foreground">{PERSONA.role} · {PERSONA.org}</div>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const pending = usePendingCount();
  return (
    <div className="sy-root flex min-h-screen w-full flex-col bg-background text-foreground md:flex-row">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 border-r bg-muted/20 p-4 md:flex">
        <Wordmark />
        <nav className="flex flex-col gap-1">
          <NavLinks pending={pending} />
        </nav>
        <div className="mt-auto flex flex-col gap-4">
          <ProdStatus />
          <div className="flex items-center justify-between gap-2">
            <Persona />
            <ThemeToggle />
          </div>
        </div>
      </aside>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex flex-col gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur md:hidden">
        <div className="flex items-center justify-between">
          <Wordmark />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{PERSONA.name} · {PERSONA.role}</span>
            <ThemeToggle />
          </div>
        </div>
        <nav className="-mx-1 flex gap-1 overflow-x-auto">
          <NavLinks pending={pending} compact />
        </nav>
      </header>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
