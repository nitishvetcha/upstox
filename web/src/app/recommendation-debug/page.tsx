"use client";

import { useCallback, useEffect, useState } from "react";
import type { RecommendationDiagnostic } from "@/lib/recommendationDiagnostic";
import { RecommendationDiagnosticPanel } from "@/components/RecommendationDiagnosticPanel";

type State = { d?: RecommendationDiagnostic; error?: string };

export default function RecommendationDebugPage() {
  const [data, setData] = useState<Record<string, State>>({});
  const load = useCallback(async () => {
    const out: Record<string, State> = {};
    await Promise.all(["NIFTY", "BANKNIFTY"].map(async (u) => {
      try {
        const r = await fetch(`/api/recommendations/diagnostic?underlying=${u}`, { cache: "no-store" });
        const j = await r.json();
        out[u] = r.ok ? { d: j } : { error: j.error ?? `HTTP ${r.status}` };
      } catch (e) {
        out[u] = { error: String(e) };
      }
    }));
    setData(out);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Why am I not getting recommendations?</h1>
          <p className="text-sm text-zinc-400">Every pipeline stage of the frozen strategy (11.4-frozen), read-only. Paper trading only — 0 real orders.</p>
        </div>
        <button onClick={load} className="rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800">Re-evaluate</button>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {["NIFTY", "BANKNIFTY"].map((u) => {
          const s = data[u];
          if (!s) return <div key={u} className="text-sm text-zinc-500">Evaluating {u}…</div>;
          if (s.error) return <div key={u} className="text-sm text-red-400">{u}: {s.error}</div>;
          return <RecommendationDiagnosticPanel key={u} d={s.d!} />;
        })}
      </div>
    </div>
  );
}
