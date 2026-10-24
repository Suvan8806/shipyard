'use client';
// One deploy flow for the agents list rows and the agent page: POST deploy, then open the gate board.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ApiRequestError, deploy, errorMessage, getAgent } from '../api';

async function findRunningVersion(name: string): Promise<number | null> {
  try {
    const d = await getAgent(name);
    return d.versions.find((v) => v.status === 'running')?.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns `{ busy, start }`. `start()` deploys and navigates to `/agents/:name/versions/:v`.
 * On a 409 conflict ("a deploy is already running") the toast offers a link to the running gate.
 */
export function useDeploy(name: string, runningVersion?: number | null) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await deploy(name);
      toast.success(`Deploying ${name} v${r.version}. The gate is running.`);
      router.push(`/agents/${encodeURIComponent(name)}/versions/${r.version}`);
      // Stay busy: the page is navigating away.
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiRequestError && e.status === 409) {
        const v = runningVersion ?? (await findRunningVersion(name));
        toast.error('A deploy is already running', {
          description: v ? `v${v} is still under test. Watch it on the gate board.` : errorMessage(e),
          action: v
            ? { label: `Open v${v}`, onClick: () => router.push(`/agents/${encodeURIComponent(name)}/versions/${v}`) }
            : undefined,
        });
        return;
      }
      if (e instanceof ApiRequestError && e.code === 'invalid_spec') {
        toast.error('The draft has errors', { description: `${errorMessage(e)} Fix them in the spec editor, then deploy.` });
        return;
      }
      toast.error('Deploy failed. No version was changed.', { description: errorMessage(e) });
    }
  };

  return { busy, start };
}
