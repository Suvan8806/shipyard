'use client';
// Teams (enterprise): agents per team, model spend this month vs the team's monthly budget. 80% = warning,
// 100% = that team's model calls are refused ("Team budget reached"); other teams are unaffected.
import Link from 'next/link';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTeams, type TeamSummary } from '../api';
import { fmtCost } from '../format';
import { EmptyState, ErrorState, StaleNotice, TableSkeleton } from '../states';
import { useData } from '../use-data';
import { Flap } from '../flap';

const POLL_MS = 15_000;

function BudgetBadge({ state }: { state: TeamSummary['budget_state'] }) {
  if (state === 'reached') return <Flap text="BUDGET REACHED" tone="fail" className="text-sm" label="Budget reached" />;
  if (state === 'warning') return <Flap text="OVER 80%" tone="warn" className="text-sm" label="Over 80% of budget" />;
  if (state === 'ok') return <Flap text="OK" tone="pass" className="text-sm" label="Within budget" />;
  return null;
}

function BudgetBar({ t }: { t: TeamSummary }) {
  if (t.monthly_budget_usd === null) return <span className="text-xs text-muted-foreground">No budget</span>;
  const pct = t.monthly_budget_usd > 0 ? Math.min(100, (t.spend_usd / t.monthly_budget_usd) * 100) : 100;
  return (
    <div className="flex min-w-40 items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${t.name} budget used`}>
        <div
          className={cn('h-full rounded-full', t.budget_state === 'reached' ? 'bg-fail-solid' : t.budget_state === 'warning' ? 'bg-warn-solid' : 'bg-pass-solid')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 text-right font-mono text-xs tabular-nums">{Math.round(pct)}%</span>
    </div>
  );
}

export function TeamsView() {
  const { data, error, refetch } = useData('teams', getTeams, { pollMs: POLL_MS });
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="board-title text-3xl sm:text-4xl">Teams</h1>
          {data && <Flap text={String(data.length)} tone="signal" className="text-[1.6rem]" label={`${data.length} teams`} />}
        </div>
        <p className="max-w-[70ch] text-muted-foreground">
          Every agent belongs to one team. Model spend this month (live chats and test runs) counts against the team&apos;s budget; at 100% that
          team&apos;s model calls are refused and other teams keep working.
        </p>
        <StaleNotice error={data ? error : null} onRetry={refetch} />
      </header>
      {data ? (
        data.length === 0 ? (
          <EmptyState icon={<Users />} title="No teams yet">
            Apply the enterprise migration to create teams.
          </EmptyState>
        ) : (
          <div className="panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/60 text-left">
                <tr>
                  <th className="field-label px-4 py-2.5">Team</th>
                  <th className="field-label px-3 py-2.5 text-right">Agents</th>
                  <th className="field-label px-3 py-2.5 text-right">Spend this month</th>
                  <th className="field-label px-3 py-2.5 text-right">Budget</th>
                  <th className="field-label px-3 py-2.5">Used</th>
                  <th className="field-label px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold">{t.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{t.id}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <Link href={`/agents?team=${encodeURIComponent(t.id)}`} className="text-primary hover:underline">
                        {t.agents}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtCost(t.spend_usd, 3)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{t.monthly_budget_usd === null ? '—' : fmtCost(t.monthly_budget_usd, 3)}</td>
                    <td className="px-3 py-2.5">
                      <BudgetBar t={t} />
                    </td>
                    <td className="px-3 py-2.5">
                      <BudgetBadge state={t.budget_state} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : error ? (
        <ErrorState title="Couldn't load teams" error={error} onRetry={refetch} />
      ) : (
        <TableSkeleton rows={7} cols={6} />
      )}
    </div>
  );
}
