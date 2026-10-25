import { Suspense } from 'react';
import { Shell } from '@/components/shipyard/shell/shell';
import { NotFoundState } from '@/components/shipyard/states';
import '@/components/shipyard/shipyard.css';

// Unmatched URLs and notFound() from any route: the dashboard shell around a styled 404.
export default function NotFound() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <Shell>
        <NotFoundState title="Page not found">That page doesn&apos;t exist in Shipyard.</NotFoundState>
      </Shell>
    </Suspense>
  );
}
