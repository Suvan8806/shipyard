'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import type { ValidationResult } from '@/lib/types';
import { cn } from '@/lib/utils';
import { saveSpec } from '../api';

const LINE_PX = 20;
const DEBOUNCE_MS = 400;

/** Maps a validation path (`tools[2]`, `gate.min_pass_rate`, `instructions`) to a 0-based line, or -1. */
export function lineForPath(yaml: string, path: string): number {
  const lines = yaml.split('\n');
  const parts = path.split('.');
  const top = parts[0].replace(/\[\d+\]$/, '');
  const topIdx = lines.findIndex((l) => l.startsWith(`${top}:`));
  if (topIdx < 0) return -1;
  if (parts.length > 1) {
    const sub = parts[1].replace(/\[\d+\]$/, '');
    for (let i = topIdx + 1; i < lines.length && /^\s/.test(lines[i]); i += 1) {
      if (lines[i].trim().startsWith(`${sub}:`)) return i;
    }
  }
  return topIdx;
}

export function SpecEditor({
  name,
  initial,
  initialValidation,
  onChange,
}: {
  name: string;
  initial: string;
  initialValidation: ValidationResult;
  onChange: (yaml: string, validation: ValidationResult | null) => void;
}) {
  const [text, setText] = useState(initial);
  const [validation, setValidation] = useState<ValidationResult | null>(initialValidation);
  const [saving, setSaving] = useState(false);
  const [focusLine, setFocusLine] = useState<number>(-1);
  const first = useRef(true);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    onChangeRef.current(text, null);
    setSaving(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const v = await saveSpec(name, text);
        if (cancelled) return;
        setValidation(v);
        onChangeRef.current(text, v);
      } catch (e) {
        if (cancelled) return;
        const v = { ok: false, errors: [{ path: '(save)', message: e instanceof Error ? e.message : String(e) }] };
        setValidation(v);
        onChangeRef.current(text, v);
      } finally {
        if (!cancelled) setSaving(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [text, name]);

  const lineCount = useMemo(() => text.split('\n').length, [text]);
  const errorLines = useMemo(
    () => new Set((validation?.errors ?? []).map((e) => lineForPath(text, e.path)).filter((n) => n >= 0)),
    [validation, text],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="max-h-[460px] overflow-auto rounded-xl border bg-muted/30">
        <div className="relative flex min-w-max font-mono text-[13px]" style={{ lineHeight: `${LINE_PX}px` }}>
          <div className="sticky left-0 z-10 select-none border-r bg-muted/60 px-2 py-3 text-right text-muted-foreground" aria-hidden>
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i} className={cn('tabular-nums', errorLines.has(i) && 'sy-text-red font-bold')}>
                {i + 1}
              </div>
            ))}
          </div>
          <div className="relative flex-1">
            {[...errorLines].map((i) => (
              <div key={`e${i}`} className="sy-bg-red pointer-events-none absolute inset-x-0" style={{ top: 12 + i * LINE_PX, height: LINE_PX }} />
            ))}
            {focusLine >= 0 && (
              <div
                className="pointer-events-none absolute inset-x-0 ring-2 ring-[var(--sy-red)] ring-inset"
                style={{ top: 12 + focusLine * LINE_PX, height: LINE_PX }}
              />
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              aria-label="Agent spec YAML"
              wrap="off"
              className="relative block w-full min-w-[560px] resize-none overflow-hidden bg-transparent px-3 py-3 outline-none"
              style={{ height: lineCount * LINE_PX + 24, lineHeight: `${LINE_PX}px` }}
            />
          </div>
        </div>
      </div>
      <div className="flex min-h-6 items-start gap-2 text-sm">
        {saving ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Validating…
          </span>
        ) : validation?.ok ? (
          <span className="sy-text-green flex items-center gap-1.5">
            <CheckCircle2 className="size-4" /> Spec is valid
          </span>
        ) : validation ? (
          <ul className="flex flex-col gap-1">
            {validation.errors.map((e, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="sy-text-red flex items-start gap-1.5 text-left hover:underline"
                  onClick={() => setFocusLine(lineForPath(text, e.path))}
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <span className="font-mono font-semibold">{e.path}</span>: {e.message}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
