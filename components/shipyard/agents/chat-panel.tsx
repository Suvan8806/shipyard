'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { ChatMessage } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { chat } from '../api';
import { fmtCost } from '../format';

interface Turn extends ChatMessage {
  run_id?: string;
  cost_usd?: number;
}

/** Talk to the live version. Each reply links to its run trace. */
export function ChatPanel({ name, liveVersion }: { name: string; liveVersion: number | null }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const content = draft.trim();
    if (!content || busy) return;
    const next: Turn[] = [...turns, { role: 'user', content }];
    setTurns(next);
    setDraft('');
    setBusy(true);
    try {
      const r = await chat(name, next.map(({ role, content: c }) => ({ role, content: c })));
      setTurns([...next, { role: 'assistant', content: r.reply, run_id: r.run_id, cost_usd: r.cost_usd }]);
    } catch (e) {
      toast.error('Chat failed', { description: e instanceof Error ? e.message : String(e) });
      setTurns(turns);
      setDraft(content);
    } finally {
      setBusy(false);
    }
  };

  if (!liveVersion) return <p className="p-6 text-center text-sm text-muted-foreground">No live version yet. Deploy one to chat.</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">Chatting with v{liveVersion} on the live system DB. Writes are real.</p>
      <ul className="flex min-h-40 flex-col gap-2">
        {turns.length === 0 && (
          <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Try “I was charged a late fee, can you waive it?”
          </li>
        )}
        {turns.map((t, i) => (
          <li key={i} className={cn('flex flex-col gap-1', t.role === 'user' ? 'items-end' : 'items-start')}>
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                t.role === 'user' ? 'bg-foreground text-background' : 'border bg-card',
              )}
            >
              {t.content}
            </div>
            {t.run_id && (
              <Link href={`/runs/${t.run_id}`} className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground">
                {fmtCost(t.cost_usd)} · trace <ArrowUpRight className="size-3" />
              </Link>
            )}
          </li>
        ))}
        {busy && (
          <li className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> thinking…
          </li>
        )}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message the agent as a member…" maxLength={4000} />
        <Button type="submit" disabled={busy || !draft.trim()} aria-label="Send">
          <Send />
        </Button>
      </form>
    </div>
  );
}
