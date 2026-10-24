import { Suspense, type ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { Shell } from '@/components/shipyard/shell/shell';
import '@/components/shipyard/shipyard.css';

// Applies the saved theme (or the OS preference) before paint to avoid a light flash.
const THEME_SCRIPT = `try{var t=localStorage.getItem('sy-theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}`;

export default function DashLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <Shell>{children}</Shell>
      </Suspense>
      <Toaster richColors position="bottom-right" />
    </>
  );
}
