"use client";
// Operator sign-in with the 6-digit PIN. The PIN lives only in component state for one request:
// it is never written to localStorage, sessionStorage, cookies, the URL or the DOM after submission.
import { useState, type FormEvent } from "react";

export default function LoginForm({ next }: { next: string }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^\d{6}$/.test(pin);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    const value = pin;
    setPin(""); // clear the field immediately, whatever the outcome
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ pin: value }),
      });
      if (res.ok) {
        window.location.assign(next);
        return;
      }
      // Server messages are generic (wrong PIN, locked for N minutes, not set up). Show them as they are.
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Sign-in failed. Try again.");
    } catch {
      setError("Could not reach the server. Check that it is running.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-labelledby="login-title" style={{ width: "100%", maxWidth: 360, display: "grid", gap: 12, padding: 20, border: "1px solid #d4d4d8", borderRadius: 12, background: "#fff", color: "#18181b" }}>
      <h1 id="login-title" style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Operator sign in</h1>
      <p style={{ margin: 0, fontSize: 13, color: "#52525b" }}>Enter your 6-digit PIN to open the analyzer. Read-only research tool; no orders are placed.</p>
      <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
        PIN
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="\d{6}"
          required
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          disabled={busy}
          style={{ padding: "8px 10px", border: "1px solid #a1a1aa", borderRadius: 6, fontSize: 18, letterSpacing: "0.3em" }}
        />
      </label>
      {error && <p role="alert" style={{ margin: 0, color: "#b91c1c", fontSize: 13 }}>{error}</p>}
      <button type="submit" disabled={busy || !valid} aria-busy={busy} style={{ padding: "9px 12px", borderRadius: 6, border: 0, background: "#18181b", color: "#fff", fontSize: 14, cursor: busy ? "wait" : "pointer", opacity: busy || !valid ? 0.6 : 1 }}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
