import LoginForm from "../../components/LoginForm";
import { safeNextPath } from "../../lib/redirectSafety.ts";

export const dynamic = "force-dynamic";

// Operator login. The redirect target is validated server-side (same-origin paths only).
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null);
  return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <LoginForm next={next} />
    </main>
  );
}
