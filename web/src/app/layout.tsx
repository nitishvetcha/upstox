import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import AppChrome from "../components/AppChrome";
import { TopProgressBar } from "../components/TopProgressBar";

// Self-hosted Geist and Geist Mono (official Vercel release v1.9.2, SIL OFL 1.1). Variable fonts cover weights 100–900.
// Replaces the build-time Google Fonts download so the production build needs no external network access.
const geistSans = localFont({ src: "./fonts/Geist-Variable.woff2", variable: "--font-geist-sans", weight: "100 900", display: "swap" });
const geistMono = localFont({ src: "./fonts/GeistMono-Variable.woff2", variable: "--font-geist-mono", weight: "100 900", display: "swap" });

// Required for the nonce-based CSP: statically prerendered pages cannot receive a per-request nonce (Next 16 CSP guide).
// Every other route is already dynamic, so this changes only the previously static /saved-picks and /strategy-evidence.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Options Analyzer",
  description: "NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX, BANKEX — options analysis and paper trading",
};

// Root layout performs no data access. Live market data is loaded only by the (dashboard) layout and its pages.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-zinc-950 text-zinc-100 selection:bg-sky-700/60">
        <TopProgressBar />
        {children}
        <AppChrome />
      </body>
    </html>
  );
}
