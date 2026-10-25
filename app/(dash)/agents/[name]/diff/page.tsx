'use client';
import { use } from 'react';
import { VersionDiffPage } from '@/components/shipyard/diff/version-diff';

const num = (v: string | string[] | undefined): number | null => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return v !== undefined && Number.isInteger(n) && n > 0 ? n : null;
};

export default function DiffPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ from?: string | string[]; to?: string | string[] }>;
}) {
  const { name } = use(params);
  const sp = use(searchParams);
  return <VersionDiffPage name={decodeURIComponent(name)} from={num(sp.from)} to={num(sp.to)} />;
}
