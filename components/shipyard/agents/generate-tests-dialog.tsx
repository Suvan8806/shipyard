'use client';
import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { acceptGeneratedTests, generateTests } from '../api';
import { parseScenario, ScenarioItem } from './scenario-list';

/** "Generate tests": asks the model for new scenarios, then lets the user pick which to accept into the draft. */
export function GenerateTestsDialog({ name, onAccepted }: { name: string; onAccepted: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [proposed, setProposed] = useState<Record<string, string> | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const start = async () => {
    setOpen(true);
    setProposed(null);
    setBusy(true);
    try {
      const r = await generateTests(name, 10);
      setProposed(r.scenarios);
      setPicked(new Set(Object.keys(r.scenarios)));
    } catch (e) {
      toast.error('Could not generate tests', { description: e instanceof Error ? e.message : String(e) });
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    if (!proposed) return;
    const chosen = Object.fromEntries(Object.entries(proposed).filter(([f]) => picked.has(f)));
    setBusy(true);
    try {
      await acceptGeneratedTests(name, chosen);
      toast.success(`Added ${Object.keys(chosen).length} generated tests to the draft`);
      setOpen(false);
      onAccepted();
    } catch (e) {
      toast.error('Could not save tests', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const toggle = (f: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  return (
    <>
      <Button variant="outline" onClick={start}>
        <Sparkles /> Generate tests
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generated tests for {name}</DialogTitle>
            <DialogDescription>
              Proposed from the spec&apos;s tools, policies and instructions. Nothing is saved until you accept.
            </DialogDescription>
          </DialogHeader>
          {busy && !proposed ? (
            <div className="flex items-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" /> Reading the spec and proposing edge cases…
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {Object.entries(proposed ?? {}).map(([file, yaml]) => (
                <label key={file} className="flex cursor-pointer gap-2">
                  <input type="checkbox" className="mt-4 size-4 accent-[var(--sy-accent)]" checked={picked.has(file)} onChange={() => toggle(file)} />
                  <ScenarioItem s={parseScenario(file, yaml)} className={cn('flex-1', !picked.has(file) && 'opacity-50')} />
                </label>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={accept} disabled={busy || !proposed || picked.size === 0}>
              {busy && proposed ? <Loader2 className="animate-spin" /> : null}
              Accept {picked.size} {picked.size === 1 ? 'test' : 'tests'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
