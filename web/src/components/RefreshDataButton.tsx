"use client";
// Re-fetches everything on the page from the server: market prices, option chain, technicals, breadth and news.
// router.refresh() re-runs the server data loading for this page; no data is cached between refreshes.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function RefreshDataButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={() => {
          setFailed(false);
          startTransition(() => {
            try {
              router.refresh();
            } catch {
              setFailed(true);
            }
          });
        }}
        className="min-h-[28px] rounded border border-zinc-600 px-2 py-0.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Refreshing…" : "Refresh data"}
      </button>
      {failed && <span role="alert" className="text-xs text-red-400">Refresh failed. Try again.</span>}
    </span>
  );
}
