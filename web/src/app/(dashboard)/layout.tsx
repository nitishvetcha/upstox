import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { getDashboard } from "@/lib/services/market";
import { fmtDate } from "@/lib/time";
import { dataLabel } from "@/lib/dataStatus";
import { verifyCurrentCredentialCached } from "@/lib/services/upstoxAuth";

// Live dashboard shell. Market data and token status are read here, for these pages only.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [{ analyses, generatedAt }, token] = await Promise.all([getDashboard(), verifyCurrentCredentialCached()]);
  const tickers = analyses.map(({ snapshot: s }) => ({
    name: s.name,
    spot: s.spot,
    change: s.prevClose === null ? null : s.spot - s.prevClose,
    expiry: fmtDate(s.expiry),
  }));
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar tickers={tickers} generatedAt={generatedAt} dataLabel={dataLabel(analyses.map((a) => a.snapshot))} upstoxStatus={token.status} />
        <main className="flex-1 px-4 py-5 sm:px-6 md:px-8 md:py-7">{children}</main>
      </div>
    </div>
  );
}
