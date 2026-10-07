import type { ReactNode } from "react";

export type Tone = "bull" | "bear" | "warn" | "neutral";

// Colour carries meaning only: green bullish/profit, red bearish/loss, amber caution.
const TONES: Record<Tone, string> = {
  bull: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  bear: "border-red-500/40 bg-red-500/10 text-red-400",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  neutral: "border-zinc-700 bg-zinc-800/60 text-zinc-300",
};

export function toneOf(label: string): Tone {
  if (label === "NO TRADE") return "neutral";
  if (/WAIT|EVENT|HIGH VOL|MOCK|PRE-OPEN|STALE/.test(label)) return "warn";
  if (/BULL|TRADE|CONNECTED|^OPEN/.test(label)) return "bull";
  if (/BEAR|ERROR/.test(label)) return "bear";
  return "neutral";
}

export function Badge({ children, tone }: { children: ReactNode; tone?: Tone }) {
  const t = tone ?? toneOf(String(children));
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold tracking-wide ${TONES[t]}`}>
      {children}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-zinc-800 bg-zinc-900/60 ${className}`}>{children}</section>;
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: Tone }) {
  const color = tone === "bull" ? "text-emerald-400" : tone === "bear" ? "text-red-400" : tone === "warn" ? "text-amber-400" : "text-zinc-100";
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`break-words font-mono text-sm tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

export const num = (n: number, d = 2) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
export const inr = (n: number) => `₹${num(n)}`;
export const signed = (n: number, d = 2) => `${n >= 0 ? "+" : ""}${num(n, d)}`;
