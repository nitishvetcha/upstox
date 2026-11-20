"use client";
// Saves one opportunity card to the saved-picks store via the existing API. Save only: no broker orders.
import { useState } from "react";
import Link from "next/link";
import type { PickInput } from "../lib/savedPicks.ts";
import { Bookmark, Check } from "lucide-react";

export function SavePickButton({ pick }: { pick: PickInput }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  async function save() {
    setState("saving");
    setMessage("");
    try {
      const res = await fetch("/api/saved-picks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(pick),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; details?: string[] };
      if (res.status === 409) {
        setState("saved");
        setMessage("Already saved today");
        return;
      }
      if (!res.ok) {
        setState("error");
        setMessage((json.details ?? [json.error ?? "save failed"]).join("; "));
        return;
      }
      setState("saved");
    } catch {
      setState("error");
      setMessage("network error: not saved");
    }
  }

  const label = state === "saving" ? "Saving…" : state === "saved" ? "Saved (NOT VALIDATED)" : "Save pick";
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={save}
        disabled={state === "saving" || state === "saved"}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-sky-700/70 bg-sky-950/50 px-3 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "saved" ? <Check size={15} aria-hidden /> : <Bookmark size={15} aria-hidden />}
        {label}
      </button>
      {state === "saved" && (
        <Link
          href="/saved-picks"
          className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-medium text-sky-400 hover:bg-zinc-800 hover:text-sky-300"
        >
          View saved picks
        </Link>
      )}
      {message && <span role="alert" className="text-xs text-red-400">{message}</span>}
    </div>
  );
}
