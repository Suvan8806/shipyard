'use client';
// The Departures signature: a split-flap board readout. Each character sits in its own board cell; when the text
// changes, the cells cascade through the alphabet and settle left to right. Reduced motion settles instantly.
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export type FlapTone = 'ink' | 'pass' | 'fail' | 'blocked' | 'running' | 'warn' | 'signal' | 'muted';

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const TICK_MS = 42;
/** Ticks before the first cell settles, and the stagger between cells. */
const LEAD_TICKS = 5;
const STAGGER_TICKS = 2;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function randomChar(seed: number): string {
  return CHARSET[(seed * 7 + 13) % CHARSET.length];
}

/**
 * Board readout. `animate` cascades on mount as well as on change (use it where the value just arrived, like a
 * verdict landing); otherwise only changes cascade.
 */
export function Flap({
  text,
  tone = 'ink',
  animate = false,
  className,
  label,
}: {
  text: string;
  tone?: FlapTone;
  /** Cascade on first render too. */
  animate?: boolean;
  className?: string;
  /** Accessible text when it should differ from the board text. */
  label?: string;
}) {
  const target = text.toUpperCase();
  const [shown, setShown] = useState<string>(() => (animate ? ' '.repeat(target.length) : target));
  const [ticking, setTicking] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    const skip = (first.current && !animate) || prefersReducedMotion();
    first.current = false;
    if (skip) {
      setShown(target);
      return;
    }
    let tick = 0;
    setTicking(true);
    const id = window.setInterval(() => {
      tick += 1;
      let done = true;
      const next = Array.from(target, (ch, i) => {
        const settleAt = LEAD_TICKS + i * STAGGER_TICKS;
        if (ch === ' ' || tick >= settleAt) return ch;
        done = false;
        return randomChar(tick + i * 5);
      }).join('');
      setShown(next);
      if (done) {
        window.clearInterval(id);
        setTicking(false);
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [target, animate]);

  const cells = Array.from(shown.padEnd(target.length, ' ').slice(0, target.length));
  return (
    <span className={cn('flap', className)} data-tone={tone}>
      <span className="sr-only">{label ?? text}</span>
      {cells.map((ch, i) => (
        <span
          key={i}
          className="flap-cell"
          data-space={target[i] === ' ' ? 'true' : undefined}
          data-ticking={ticking && ch !== target[i] ? 'true' : undefined}
          aria-hidden
        >
          {/* keying on the character re-runs the leaf animation each time a new character drops */}
          <span key={ch}>{ch === ' ' ? ' ' : ch}</span>
        </span>
      ))}
    </span>
  );
}
