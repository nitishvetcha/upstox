"use client";

import { useEffect } from "react";

const CHUNK_RELOAD_KEY = "chunk_reload_attempted";
const CHUNK_RELOAD_WINDOW_MS = 30_000;

function isChunkLoadError(error: Error): boolean {
  const msg = error?.message ?? "";
  return error?.name === "ChunkLoadError" || /Loading chunk .* failed/i.test(msg);
}

// Route-level boundary: a failing page shows this instead of a blank screen; the shell (sidebar, top bar) stays.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const chunkErr = isChunkLoadError(error);

  useEffect(() => {
    if (!chunkErr) return;
    try {
      const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? "0");
      if (!Number.isFinite(last) || Date.now() - last > CHUNK_RELOAD_WINDOW_MS) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
        window.location.reload();
      }
    } catch {
      // sessionStorage unavailable; user can still click Retry
    }
  }, [chunkErr]);

  const handleRetry = () => {
    if (chunkErr) {
      window.location.reload();
    } else {
      reset();
    }
  };

  return (
    <div className="mx-auto max-w-3xl rounded border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
      <div className="font-semibold">This section could not be loaded.</div>
      <p className="mt-1 text-zinc-300">{error.message || "Unexpected error"}</p>
      {error.digest && <p className="mt-1 font-mono text-xs text-zinc-500">digest: {error.digest}</p>}
      <button onClick={handleRetry} className="mt-3 rounded border border-zinc-600 px-3 py-1 text-xs text-zinc-100 hover:bg-zinc-800">
        Retry
      </button>
    </div>
  );
}
