"use client";
// Logout: the server revokes the session and clears the cookie; the browser then goes to /login.
import { useState } from "react";

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);
  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } finally {
      window.location.assign("/login");
    }
  }
  return (
    <button type="button" onClick={logout} disabled={busy} style={{ padding: "4px 8px", fontSize: 12, borderRadius: 6, border: "1px solid #3f3f46", background: "transparent", color: "#d4d4d8", cursor: busy ? "wait" : "pointer" }}>
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
