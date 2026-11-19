"use client";
// Change the 6-digit operator PIN. Needs the current PIN and the new PIN (typed twice). Nothing is stored in the browser.
import { useState, type FormEvent } from "react";

const FIELD = { padding: "8px 10px", border: "1px solid #a1a1aa", borderRadius: 6, fontSize: 16, letterSpacing: "0.3em", background: "#fff", color: "#18181b" } as const;

export default function ChangePinPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);
  const valid = /^\d{6}$/.test(current) && /^\d{6}$/.test(next) && next === confirm && next !== current;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    setDone(false);
    const body = JSON.stringify({ current, next });
    setCurrent(""); setNext(""); setConfirm(""); // clear the fields whatever the outcome
    try {
      const res = await fetch("/api/auth/change-pin", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body });
      if (res.status === 401) { window.location.assign("/login?next=/change-pin"); return; }
      if (res.ok) { setDone(true); return; }
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(j?.error ?? "The PIN could not be changed. Try again.");
    } catch {
      setError("Could not reach the server. Check that it is running.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "#f4f4f5" }}>
      <form onSubmit={submit} aria-labelledby="pin-title" style={{ width: "100%", maxWidth: 380, display: "grid", gap: 12, padding: 20, border: "1px solid #d4d4d8", borderRadius: 12, background: "#fff", color: "#18181b" }}>
        <h1 id="pin-title" style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Change PIN</h1>
        <p style={{ margin: 0, fontSize: 13, color: "#52525b" }}>Enter your current PIN, then the new 6-digit PIN twice. The new PIN must differ from the current one.</p>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Current PIN
          <input name="current" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={current} onChange={(e) => setCurrent(digits(e.target.value))} disabled={busy} style={FIELD} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          New PIN
          <input name="next" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={next} onChange={(e) => setNext(digits(e.target.value))} disabled={busy} style={FIELD} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Confirm new PIN
          <input name="confirm" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={confirm} onChange={(e) => setConfirm(digits(e.target.value))} disabled={busy} style={FIELD} />
        </label>
        {next.length === 6 && confirm.length === 6 && next !== confirm && <p style={{ margin: 0, fontSize: 13, color: "#b91c1c" }}>The two new PINs do not match.</p>}
        {error && <p role="alert" style={{ margin: 0, color: "#b91c1c", fontSize: 13 }}>{error}</p>}
        {done && <p role="status" style={{ margin: 0, color: "#15803d", fontSize: 13 }}>PIN changed. Use the new PIN the next time you sign in.</p>}
        <button type="submit" disabled={busy || !valid} aria-busy={busy} style={{ padding: "9px 12px", borderRadius: 6, border: 0, background: "#18181b", color: "#fff", fontSize: 14, cursor: busy ? "wait" : "pointer", opacity: busy || !valid ? 0.6 : 1 }}>
          {busy ? "Changing…" : "Change PIN"}
        </button>
      </form>
    </main>
  );
}
