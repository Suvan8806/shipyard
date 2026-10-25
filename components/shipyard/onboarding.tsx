'use client';
// First-run guidance: a dismissible "How this works" board on the fleet page, and one-line captions that say what
// each screen is for. The guide remembers its dismissal per browser (a convenience, never required state).
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Info, X } from 'lucide-react';
import { Flap } from './flap';

const GUIDE_KEY = 'sy-guide-dismissed';

const STEPS: { n: string; title: string; body: string }[] = [
  { n: '1', title: 'One spec per agent', body: 'An agent is a short YAML file that inherits shared tools, policies, instruction blocks and test packs.' },
  { n: '2', title: 'Deploy runs the gate', body: 'About 46 tests, each on its own throwaway twin of the database, land on the gate board.' },
  { n: '3', title: 'Data decides', body: 'If the end state of the data is wrong, the deploy is blocked and the previous version keeps serving.' },
];

export function HowItWorksGuide() {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(GUIDE_KEY) === '1';
    } catch {
      /* storage blocked: show the guide */
    }
    setHidden(dismissed);
  }, []);
  if (hidden) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(GUIDE_KEY, '1');
    } catch {
      /* storage blocked: it just comes back next visit */
    }
  };
  return (
    <section className="board relative overflow-hidden" aria-labelledby="guide-title">
      <div className="h-1.5 bg-signal" aria-hidden />
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id="guide-title" className="board-title text-2xl text-board-ink sm:text-3xl">
            How this works
          </h2>
          <button
            type="button"
            onClick={dismiss}
            className="grid size-9 shrink-0 place-items-center rounded-md text-board-muted hover:bg-board-raised hover:text-board-ink focus-visible:ring-2 focus-visible:ring-signal focus-visible:outline-none"
            aria-label="Dismiss the guide"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-3">
              <Flap text={s.n} tone="signal" className="text-2xl" label={`Step ${s.n}`} />
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-bold text-board-ink">{s.title}</h3>
                <p className="text-sm leading-relaxed text-board-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-board-rule pt-4">
          <p className="text-base text-board-ink">
            <span className="font-bold text-signal">Try it:</span> open support-agent, change one line, click Deploy.
          </p>
          <Link
            href="/agents/support-agent"
            className="inline-flex items-center gap-1.5 rounded-md bg-signal px-3.5 py-2 text-sm font-bold text-signal-foreground hover:bg-[color-mix(in_oklch,var(--signal),black_8%)] focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-board focus-visible:outline-none"
          >
            Open support-agent <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link href="/" className="text-sm font-bold text-board-muted underline-offset-4 hover:text-board-ink hover:underline">
            Read the overview
          </Link>
        </div>
      </div>
    </section>
  );
}

/** One line under a page title that says what the screen is for. */
export function Caption({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-base text-muted-foreground">
      <Info className="mt-1 size-4 shrink-0 text-link" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
