"use client";
// Saves one opportunity card to the saved-picks store via the existing API. Save only: no broker orders.
import { useState } from "react";
import Link from "next/link";
import type { PickInput } from "../lib/savedPicks.ts";

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
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={save}
        disabled={state === "saving" || state === "saved"}
        className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {label}
      </button>
      {state === "saved" && (
        <Link
          href="/saved-picks"
          className="text-xs text-sky-400 underline hover:text-sky-300"
        >
          View saved picks →
        </Link>
      )}
      {message && <span role="alert" className="text-xs text-red-400">{message}</span>}
    </div>
  );
}
