'use client';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** A shell command on a board-black strip with a copy button. */
export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the command stays selectable */
    }
  };
  return (
    <div className="board flex items-stretch overflow-hidden shadow-none">
      <code className="min-w-0 flex-1 overflow-x-auto px-4 py-3.5 font-mono text-sm whitespace-nowrap text-board-ink sm:text-base">
        <span className="mr-2 select-none text-signal" aria-hidden>
          $
        </span>
        {command}
      </code>
      <button
        type="button"
        onClick={() => void copy()}
        className="flex shrink-0 items-center gap-1.5 border-l border-board-rule bg-board-raised px-4 text-sm font-bold text-board-ink transition-colors hover:bg-signal hover:text-signal-foreground focus-visible:ring-2 focus-visible:ring-signal focus-visible:outline-none focus-visible:ring-inset"
        aria-label={copied ? 'Copied' : 'Copy command'}
      >
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  );
}
