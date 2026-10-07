"use client";

// Route-level boundary: a failing page shows this instead of a blank screen; the shell (sidebar, top bar) stays.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-3xl rounded border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
      <div className="font-semibold">This section could not be loaded.</div>
      <p className="mt-1 text-zinc-300">{error.message || "Unexpected error"}</p>
      <button onClick={reset} className="mt-3 rounded border border-zinc-600 px-3 py-1 text-xs text-zinc-100 hover:bg-zinc-800">Retry</button>
    </div>
  );
}
