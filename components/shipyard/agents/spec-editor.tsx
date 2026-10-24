'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleCheck, Loader2, OctagonX, RotateCw, TriangleAlert } from 'lucide-react';
import type { ValidationError, ValidationResult } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ApiRequestError, errorMessage, saveSpec } from '../api';

const LINE_PX = 22;
const PAD_Y = 12;
const DEBOUNCE_MS = 500;
export const LINE_BUDGET = 20;

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
export interface SpecStatus {
  yaml: string;
  validation: ValidationResult | null;
  save: SaveState;
}

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

/** A 400 invalid_spec from PUT carries validation errors in `details`; anything else is a save failure. */
function validationFromError(e: unknown): ValidationResult | null {
  if (!(e instanceof ApiRequestError) || e.code !== 'invalid_spec') return null;
  const d = e.details as { errors?: ValidationError[] } | ValidationError[] | undefined;
  const errors = Array.isArray(d) ? d : Array.isArray(d?.errors) ? d.errors : [{ path: '(spec)', message: e.message }];
  return { ok: false, errors };
}

function HeaderState({ save, validation, onRetry }: { save: SaveState; validation: ValidationResult | null; onRetry: () => void }) {
  if (save === 'pending' || save === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> {save === 'saving' ? 'Saving…' : 'Editing…'}
      </span>
    );
  }
  if (save === 'error') {
    return (
      <button type="button" onClick={onRetry} className="flex items-center gap-1.5 font-semibold text-warn hover:underline">
        <TriangleAlert className="size-3.5" aria-hidden /> Not saved · Retry
      </button>
    );
  }
  if (!validation) return null;
  if (validation.ok) {
    return (
      <span className="flex items-center gap-1.5 font-semibold text-pass">
        <CircleCheck className="size-3.5" aria-hidden /> {save === 'saved' ? 'Saved · valid' : 'Valid'}
      </span>
    );
  }
  const n = validation.errors.length;
  return (
    <span className="flex items-center gap-1.5 font-semibold text-fail">
      <OctagonX className="size-3.5" aria-hidden /> {n} {n === 1 ? 'error' : 'errors'}
    </span>
  );
}

export function SpecEditor({
  name,
  initial,
  initialValidation,
  onStatus,
}: {
  name: string;
  initial: string;
  initialValidation: ValidationResult;
  onStatus: (s: SpecStatus) => void;
}) {
  const [text, setText] = useState(initial);
  const [validation, setValidation] = useState<ValidationResult | null>(initialValidation);
  const [save, setSave] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [focusLine, setFocusLine] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const touched = useRef(false);
  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    onStatusRef.current = onStatus;
  });

  useEffect(() => {
    onStatusRef.current({ yaml: text, validation, save });
  }, [text, validation, save]);

  // Debounced PUT on every edit (and on Retry). The user's text is never replaced by the server.
  useEffect(() => {
    if (!touched.current) return;
    setSave('pending');
    let cancelled = false;
    const t = setTimeout(async () => {
      setSave('saving');
      try {
        const v = await saveSpec(name, text);
        if (cancelled) return;
        setValidation(v);
        setSaveError(null);
        setSave('saved');
      } catch (e) {
        if (cancelled) return;
        const v = validationFromError(e);
        if (v) {
          setValidation(v);
          setSaveError(null);
          setSave('saved');
        } else {
          setSaveError(errorMessage(e));
          setSave('error');
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [text, name, attempt]);

  const lines = useMemo(() => text.split('\n'), [text]);
  const initialLines = useMemo(() => initial.split('\n'), [initial]);
  const lineCount = lines.length;
  const errors = useMemo(() => (validation?.ok === false ? validation.errors : []), [validation]);
  const errorLines = useMemo(
    () => new Set(errors.map((e) => lineForPath(text, e.path)).filter((n) => n >= 0)),
    [errors, text],
  );
  const overBudget = lineCount > LINE_BUDGET;

  const focusError = (path: string) => {
    const line = lineForPath(text, path);
    setFocusLine(line);
    const ta = textareaRef.current;
    if (!ta || line < 0) return;
    const start = lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0);
    ta.focus();
    ta.setSelectionRange(start, start + lines[line].length);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-md border bg-card">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-muted px-3 py-2 text-xs">
          <span className="font-mono text-[13px] font-medium">{name}.yaml</span>
          <span className="text-muted-foreground">draft</span>
          <span className="ml-auto flex items-center gap-4" aria-live="polite">
            <span className={cn('font-mono tabular-nums', overBudget ? 'font-semibold text-warn' : 'text-muted-foreground')}>
              {lineCount} / {LINE_BUDGET} lines
            </span>
            <HeaderState save={save} validation={validation} onRetry={() => setAttempt((a) => a + 1)} />
          </span>
        </div>
        <div className="max-h-[520px] overflow-auto">
          <div className="relative flex min-w-max font-mono" style={{ lineHeight: `${LINE_PX}px` }}>
            <div
              className="sticky left-0 z-10 select-none border-r bg-muted text-right text-[13px] text-muted-foreground"
              style={{ paddingTop: PAD_Y, paddingBottom: PAD_Y }}
              aria-hidden
            >
              {lines.map((l, i) => (
                <div key={i} className="relative pr-2 pl-3 tabular-nums">
                  {l !== initialLines[i] && <span className="absolute inset-y-0.5 left-0 w-0.5 bg-primary" />}
                  <span className={cn(errorLines.has(i) && 'font-semibold text-fail')}>{i + 1}</span>
                </div>
              ))}
            </div>
            <div className="relative flex-1">
              {[...errorLines].map((i) => (
                <div
                  key={`e${i}`}
                  className="pointer-events-none absolute inset-x-0 bg-fail-subtle"
                  style={{ top: PAD_Y + i * LINE_PX, height: LINE_PX }}
                />
              ))}
              {focusLine >= 0 && errorLines.has(focusLine) && (
                <div
                  className="pointer-events-none absolute inset-x-0 border-y border-fail-border"
                  style={{ top: PAD_Y + focusLine * LINE_PX, height: LINE_PX }}
                />
              )}
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => {
                  touched.current = true;
                  setText(e.target.value);
                }}
                spellCheck={false}
                aria-label={`${name} spec YAML`}
                aria-invalid={errors.length > 0}
                wrap="off"
                className="relative block w-full min-w-[560px] resize-none overflow-hidden bg-transparent px-3 text-sm outline-none"
                style={{ height: lineCount * LINE_PX + PAD_Y * 2, lineHeight: `${LINE_PX}px`, paddingTop: PAD_Y, paddingBottom: PAD_Y }}
              />
            </div>
          </div>
        </div>
      </div>

      {save === 'error' && saveError && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-warn-border bg-warn-subtle px-3 py-2 text-sm">
          <TriangleAlert className="size-4 shrink-0 text-warn" aria-hidden />
          <span className="min-w-0 flex-1">
            Couldn&apos;t save the draft: {saveError} Your edits are kept here.
          </span>
          <button type="button" onClick={() => setAttempt((a) => a + 1)} className="inline-flex items-center gap-1 font-semibold underline">
            <RotateCw className="size-3.5" aria-hidden /> Retry save
          </button>
        </div>
      )}

      {errors.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm" aria-label="Validation errors">
          {errors.map((e, i) => (
            <li key={`${e.path}-${i}`}>
              <button
                type="button"
                className="flex items-start gap-1.5 text-left text-fail hover:underline"
                onClick={() => focusError(e.path)}
              >
                <OctagonX className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <span className="font-mono font-semibold">{e.path}</span>
                  <span className="text-foreground">: {e.message}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
