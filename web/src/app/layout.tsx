import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { getDashboard } from "@/lib/services/market";
import { fmtDate } from "@/lib/time";
import { dataLabel } from "@/lib/dataStatus";
import { tokenStatus } from "@/lib/services/upstoxAuth";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Options Analyzer",
  description: "NIFTY and BANK NIFTY options analysis and paper trading",
};

// Market data changes every request; never prerender.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [{ analyses, generatedAt }, token] = await Promise.all([getDashboard(), tokenStatus()]);
  const tickers = analyses.map(({ snapshot: s }) => ({
    name: s.name,
    spot: s.spot,
    change: s.prevClose === null ? null : s.spot - s.prevClose,
    expiry: fmtDate(s.expiry),
  }));

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-zinc-950 text-zinc-100 md:flex-row">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            tickers={tickers}
            generatedAt={generatedAt}
            dataLabel={dataLabel(analyses.map((a) => a.snapshot))}
            upstoxStatus={token.status}
          />
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
