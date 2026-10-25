'use client';
import { useRef, useState } from 'react';
import { Copy, Loader2, RotateCw, Sparkles, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { acceptGeneratedTests, errorMessage, generateTests, USE_MOCKS } from '../api';
import { useNow } from '../use-data';
import { parseScenario, ScenarioItem } from './scenario-list';

const COUNT = 10;
type Phase = 'idle' | 'generating' | 'review' | 'error' | 'saving' | 'export';

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${what}`);
  } catch {
    toast.error('Copy failed', { description: 'Your browser blocked clipboard access. Select the text and copy it by hand.' });
  }
}

function YamlExport({ files }: { files: Record<string, string> }) {
  const entries = Object.entries(files);
  const all = entries.map(([f, y]) => `# ${f}\n${y.trimEnd()}\n`).join('\n');
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          Saving generated tests into the draft isn&apos;t wired yet; paste them into the scenario files.
        </p>
        <Button size="sm" variant="outline" onClick={() => void copyText(all, `${entries.length} scenario files`)}>
          <Copy aria-hidden /> Copy all
        </Button>
      </div>
      <ul className="flex flex-col gap-3">
        {entries.map(([file, yaml]) => (
          <li key={file} className="overflow-hidden rounded-md border">
            <div className="flex items-center justify-between border-b bg-muted px-3 py-1.5">
              <span className="font-mono text-xs font-medium">scenarios/{file}</span>
              <Button size="xs" variant="ghost" onClick={() => void copyText(yaml, file)} aria-label={`Copy ${file}`}>
                <Copy aria-hidden /> Copy
              </Button>
            </div>
            <pre className="max-h-56 overflow-auto bg-card px-3 py-2 font-mono text-xs leading-5">{yaml}</pre>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Generate tests": the model proposes scenarios; the user picks which to keep. */
export function GenerateTestsDialog({ name, onAccepted }: { name: string; onAccepted: () => void }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [startedAt, setStartedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [proposed, setProposed] = useState<Record<string, string> | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const reqId = useRef(0);
  const now = useNow(1000, phase === 'generating');

  const generate = async () => {
    const id = ++reqId.current;
    setOpen(true);
    setPhase('generating');
    setStartedAt(Date.now());
    setError(null);
    setProposed(null);
    try {
      const r = await generateTests(name, COUNT);
      if (id !== reqId.current) return;
      setProposed(r.scenarios);
      setPicked(new Set(Object.keys(r.scenarios)));
      setPhase('review');
    } catch (e) {
      if (id !== reqId.current) return;
      setError(errorMessage(e));
      setPhase('error');
      toast.error('Could not generate tests', { description: errorMessage(e) });
    }
  };

  const chosen = () => Object.fromEntries(Object.entries(proposed ?? {}).filter(([f]) => picked.has(f)));

  const accept = async () => {
    const files = chosen();
    if (!USE_MOCKS) {
      setPhase('export');
      return;
    }
    setPhase('saving');
    try {
      await acceptGeneratedTests(name, files);
      toast.success(`Added ${Object.keys(files).length} generated tests to the draft`);
      setOpen(false);
      setPhase('idle');
      onAccepted();
    } catch (e) {
      toast.error('Could not save tests', { description: errorMessage(e) });
      setPhase('review');
    }
  };

  const close = (next: boolean) => {
    setOpen(next);
    if (next) return;
    reqId.current += 1; // ignore a late response
    if (phase !== 'review') setPhase('idle');
  };

  const toggle = (f: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  const secs = Math.max(0, Math.floor((now - startedAt) / 1000));
  const entries = Object.entries(proposed ?? {});

  return (
    <>
      <Button variant="outline" onClick={() => void generate()} disabled={phase === 'generating'}>
        {phase === 'generating' ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />} Generate tests
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generated tests for {name}</DialogTitle>
            <DialogDescription>
              Proposed from the spec&apos;s tools, policies and instructions. Nothing is saved until you accept.
            </DialogDescription>
          </DialogHeader>

          {phase === 'generating' && (
            <div className="flex flex-col gap-1 py-10" aria-live="polite">
              <span className="flex items-center gap-2 text-foreground">
                <Loader2 className="size-5 animate-spin" aria-hidden /> Reading the spec and proposing edge cases…
                <span className="font-mono text-sm tabular-nums text-muted-foreground">{secs}s</span>
              </span>
              <span className="text-sm text-muted-foreground">This usually takes 10 to 30 seconds.</span>
            </div>
          )}

          {phase === 'error' && (
            <div role="alert" className="flex flex-col items-start gap-3 rounded-md border border-warn-border bg-warn-subtle p-4">
              <p className="flex items-start gap-2 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                <span>
                  <span className="font-semibold">Couldn&apos;t generate tests.</span> {error}
                </span>
              </p>
              <Button size="sm" variant="outline" onClick={() => void generate()}>
                <RotateCw aria-hidden /> Try again
              </Button>
            </div>
          )}

          {(phase === 'review' || phase === 'saving') &&
            (entries.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                The model didn&apos;t propose any new scenarios. The current tests may already cover this spec.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {entries.map(([file, yaml]) => (
                  <li key={file}>
                  <label className="flex cursor-pointer gap-2">
                    <input
                      type="checkbox"
                      className="mt-4 size-4 accent-primary"
                      checked={picked.has(file)}
                      onChange={() => toggle(file)}
                    />
                    <ScenarioItem as="div" s={parseScenario(file, yaml)} className={cn('flex-1', !picked.has(file) && 'opacity-50')} />
                  </label>
                  </li>
                ))}
              </ul>
            ))}

          {phase === 'export' && <YamlExport files={chosen()} />}

          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              {phase === 'export' ? 'Done' : 'Cancel'}
            </Button>
            {(phase === 'review' || phase === 'saving') && entries.length > 0 && (
              <Button onClick={() => void accept()} disabled={phase === 'saving' || picked.size === 0}>
                {phase === 'saving' && <Loader2 className="animate-spin" aria-hidden />}
                {USE_MOCKS ? 'Accept' : 'Export'} {picked.size} {picked.size === 1 ? 'test' : 'tests'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
