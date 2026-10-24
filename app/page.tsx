import Link from "next/link";

// W0 placeholder. Lane D replaces this with the dashboard entry.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-4">
      <h1 className="text-4xl font-semibold tracking-tight">Shipyard</h1>
      <p className="text-muted-foreground">
        Every agent change is tested against digital twins before it reaches members.
      </p>
      <Link href="/agents" className="underline underline-offset-4">
        View agents
      </Link>
    </main>
  );
}
