"use client";
// Global chrome shared by every page: the sign-out control. Hidden on the login page itself.
import { usePathname } from "next/navigation";
import Link from "next/link";
import LogoutButton from "./LogoutButton";

export default function AppChrome() {
  const pathname = usePathname();
  if (pathname === "/login" || pathname.startsWith("/login/") || pathname === "/change-pin") return null;
  return (
    // Bottom-right: keeps the sign-out control clear of the top-bar ticker text.
    <div style={{ position: "fixed", bottom: 12, right: 12, zIndex: 50 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Link href="/change-pin" style={{ padding: "4px 8px", fontSize: 12, borderRadius: 6, border: "1px solid #3f3f46", color: "#d4d4d8", textDecoration: "none" }}>Change PIN</Link>
        <LogoutButton />
      </div>
    </div>
  );
}
