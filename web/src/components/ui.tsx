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

export function Stat({
  label,
  value,
  tone,
  hint,
  sub,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  hint?: string;
  sub?: string;
}) {
  const color =
    tone === "bull"
      ? "text-emerald-400"
      : tone === "bear"
        ? "text-red-400"
        : tone === "warn"
          ? "text-amber-400"
          : "text-zinc-100";
  return (
    <div className="min-w-0" title={hint}>
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-zinc-500">
        <span>{label}</span>
        {hint && (
          <span className="cursor-help text-zinc-600 hover:text-zinc-400 text-[10px]" title={hint}>
            ⓘ
          </span>
        )}
      </div>
      <div className={`break-words font-mono text-sm tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-zinc-400 truncate mt-0.5">{sub}</div>}
    </div>
  );
}

export const num = (n: number, d = 2) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
export const inr = (n: number) => `₹${num(n)}`;
export const signed = (n: number, d = 2) => `${n >= 0 ? "+" : ""}${num(n, d)}`;

// Operational states, distinct from market tones. Text always states the status; colour only reinforces it.
export type Status = "ok" | "warn" | "error" | "stale" | "blocked" | "unknown" | "info";
const STATUS: Record<Status, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  error: "border-red-500/50 bg-red-500/10 text-red-300",
  stale: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  blocked: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300",
  unknown: "border-zinc-600 bg-zinc-800 text-zinc-400",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-300",
};
export function StatusPill({ status, children, title }: { status: Status; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold tracking-wide ${STATUS[status]}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />{children}
    </span>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <h2 className="mb-2 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">
      {children}{hint && <span className="normal-case tracking-normal text-zinc-500" title={hint}>ⓘ</span>}
    </h2>
  );
}

export const fmtIstTs = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) + " IST" : "—";
