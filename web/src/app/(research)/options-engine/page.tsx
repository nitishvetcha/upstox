import * as fs from "node:fs";
import * as path from "node:path";
import { Badge, Card, Stat } from "@/components/ui";
import { evaluate, OPT_GATES, type Decision } from "@/lib/options/recommend";
import { storedSnapshots, type StoredSnapshot } from "@/lib/options/storedResearch";
import { syntheticChain, syntheticRisk, syntheticUnderlying } from "@/lib/options/fixture";
import { storedResearchRowBadge } from "@/lib/options/storedResearchBadge";

// Options successor engine dashboard. Stored research samples are shown as STORED (not live). The synthetic
// demonstration is labelled SYNTHETIC. Nothing on this page calls a broker or market-data service.
export const dynamic = "force-dynamic";

type Report = { sessions: { session: string; byIndex: { index: string; qualifyingRounds: number; sessionQualifies: boolean }[] }[] };
const ASSUMED_CAPITAL = 1_000_000; // assumption: a placeholder account size for sizing illustrations, not the user's capital

function latestReport(): Report | null {
  const dir = path.join(process.cwd(), ".data/options-audit-research");
  try {
    const files = fs.readdirSync(dir).filter((f) => /^report-research_\d{4}-\d{2}-\d{2}_\d+\.json$/.test(f));
    const newest = files.sort((a, b) => Number(b.match(/_(\d+)\.json$/)![1]) - Number(a.match(/_(\d+)\.json$/)![1]))[0];
    return newest ? (JSON.parse(fs.readFileSync(path.join(dir, newest), "utf8")) as Report) : null;
  } catch {
    return null;
  }
}

const ist = (iso: string) => new Date(Date.parse(iso) + 330 * 60_000).toISOString().replace("T", " ").slice(0, 16) + " IST";
const num = (v: number | null | undefined, d = 2) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—");

function decide(s: StoredSnapshot, now: string): Decision {
  return evaluate({
    underlying: s.underlying,
    chain: s.chain,
    risk: { capital: ASSUMED_CAPITAL, dailyLossSoFar: 0, dailyLossLimitPct: 2, openRecommendations: 0, maxConcurrent: 3 },
    now,
  });
}

function PayoffSvg({ premium, strike, type, spot }: { premium: number; strike: number; type: "CE" | "PE"; spot: number }) {
  const lo = strike * 0.97, hi = strike * 1.03, w = 560, h = 160;
  const pts = Array.from({ length: 61 }, (_, i) => {
    const s = lo + ((hi - lo) * i) / 60;
    const intrinsic = Math.max(0, type === "CE" ? s - strike : strike - s);
    return { s, pnl: intrinsic - premium };
  });
  const minP = Math.min(...pts.map((p) => p.pnl)), maxP = Math.max(...pts.map((p) => p.pnl)), span = maxP - minP || 1;
  const x = (s: number) => ((s - lo) / (hi - lo)) * w;
  const y = (p: number) => h - ((p - minP) / span) * h;
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.s).toFixed(1)},${y(p.pnl).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="model payoff at expiry (synthetic)">
      <line x1="0" x2={w} y1={y(0)} y2={y(0)} stroke="#3f3f46" strokeDasharray="4 4" />
      <line x1={x(spot)} x2={x(spot)} y1="0" y2={h} stroke="#52525b" strokeDasharray="2 3" />
      <path d={d} fill="none" stroke="#38bdf8" strokeWidth={2} />
    </svg>
  );
}

export default function OptionsEnginePage() {
  const now = new Date().toISOString();
  const report = latestReport();
  const snaps = storedSnapshots();
  const synthNow = "2026-11-05T05:00:00.000Z";
  const synth = evaluate({ underlying: syntheticUnderlying(synthNow, 24000), chain: syntheticChain(synthNow, 24000, "2026-11-12"), risk: syntheticRisk, now: synthNow });
  const payoff = synth.status === "RECOMMENDATION" ? synth : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 text-zinc-200">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold text-zinc-50">Options recommendation engine (successor)</h1>
        <Badge tone="warn">RECOMMENDATION-ONLY · YOU MAKE ALL DECISIONS</Badge>
        <Badge tone="warn">NOT VALIDATED</Badge>
        <Badge tone="warn">NO HISTORICAL OPTIONS BACKTEST</Badge>
        <Badge tone="warn">NO ORDERS</Badge>
      </header>

      <Card className="space-y-2 p-4 text-sm">
        <div className="text-xs uppercase tracking-wider text-zinc-400">What this shows</div>
        <p className="text-zinc-300">
          The latest <b>stored</b> research round per index (historical collection samples, not live quotes), evaluated by the successor engine at the current time. Strategy 11.4 is frozen and separate. A NO TRADE is the expected result when required data or gates fail.
        </p>
        <p className="text-xs text-zinc-500">Live recommendations require an explicit live-data run, which this page does not perform. No broker or market-data request is made here.</p>
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs uppercase tracking-wider text-zinc-400">Six indices — latest stored round</div>
          <Badge tone="warn">STORED RESEARCH · NOT LIVE</Badge>
        </div>
        {snaps.length === 0 ? (
          <p className="text-sm text-amber-300">No stored research rounds found.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {snaps.map((s) => {
              const d = decide(s, now);
              const ageS = Math.round((Date.parse(now) - Date.parse(s.storedAt)) / 1000);
              return (
                <div key={s.index} className="space-y-2 rounded border border-zinc-800 p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-zinc-100">{s.label}</div>
                    {(() => { const b = storedResearchRowBadge(d.status); return <Badge tone={b.tone}>{b.text}</Badge>; })()}
                  </div>
                  <div className="font-mono text-[11px] text-zinc-400">
                    spot {num(s.spot, 2)} · expiry {s.expiry} · stored {ist(s.storedAt)} ({Math.round(ageS / 60)} min old)
                  </div>
                  <div className="font-mono text-[11px] text-zinc-500">
                    samples {s.samples} · liquid {s.liquidSamples} · with quote {s.withQuote} · with bid/ask {s.withBidAsk} · with chain IV {s.withChainIv} · market {s.marketState ?? "unknown"}
                  </div>
                  {d.status === "NO_TRADE" ? (
                    <ul className="list-disc space-y-0.5 pl-4 text-xs text-zinc-400">
                      {d.reasons.slice(0, 5).map((r) => <li key={r}>{r}</li>)}
                      {d.reasons.length > 5 && <li>+{d.reasons.length - 5} more</li>}
                    </ul>
                  ) : (
                    <div className="text-xs text-zinc-300">{d.optionType} {d.strike} · qty {d.quantity}</div>
                  )}
                  <details className="text-xs text-zinc-400">
                    <summary className="cursor-pointer">Chain sample (stored, near ATM)</summary>
                    <div className="overflow-x-auto">
                      <table className="mt-2 w-full text-left font-mono text-[10px]">
                        <thead className="text-zinc-500"><tr><th className="pr-2">Strike</th><th className="pr-2">CE ltp</th><th className="pr-2">CE bid/ask</th><th className="pr-2">CE last trade</th><th className="pr-2">PE ltp</th><th className="pr-2">PE bid/ask</th></tr></thead>
                        <tbody>
                          {s.chain
                            .filter((r) => Math.abs(r.strike - s.spot) <= s.spot * 0.02)
                            .slice(0, 12)
                            .map((r) => (
                              <tr key={r.strike} className="border-t border-zinc-800">
                                <td className="pr-2">{r.strike}</td>
                                <td className="pr-2">{num(r.call?.ltp, 2)}</td>
                                <td className="pr-2">{num(r.call?.bid, 2)} / {num(r.call?.ask, 2)}</td>
                                <td className="pr-2">{r.call?.lastTradeTime ? ist(r.call.lastTradeTime) : "—"}</td>
                                <td className="pr-2">{num(r.put?.ltp, 2)}</td>
                                <td className="pr-2">{num(r.put?.bid, 2)} / {num(r.put?.ask, 2)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-1 text-[10px] text-zinc-500">Open interest and volume are not recorded in these samples, so no liquidity gate can pass on them.</p>
                  </details>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="space-y-2 p-4 text-sm">
        <div className="text-xs uppercase tracking-wider text-zinc-400">Gates (proposals — not validated)</div>
        <ul className="grid grid-cols-1 gap-1 font-mono text-xs sm:grid-cols-2">
          <li>quote max age: {OPT_GATES.quoteMaxAgeSeconds} s</li>
          <li>max bid/ask spread: {OPT_GATES.maxSpreadPct}%</li>
          <li>min open interest: {OPT_GATES.minOpenInterest} (not recorded in samples)</li>
          <li>min volume: {OPT_GATES.minVolume} (not recorded in samples)</li>
          <li>min days to expiry: {OPT_GATES.minDaysToExpiry}</li>
          <li>delta window: {OPT_GATES.deltaWindow.min}–{OPT_GATES.deltaWindow.max}</li>
          <li>min reward-to-risk: {OPT_GATES.minRewardToRisk}</li>
          <li>risk per recommendation: {OPT_GATES.maxRiskPctOfCapital}% of capital</li>
        </ul>
      </Card>

      <Card className="space-y-2 p-4">
        <div className="text-xs uppercase tracking-wider text-zinc-400">Research status by index (local audit report)</div>
        {report ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {["nifty", "banknifty", "finnifty", "midcpnifty", "sensex", "bankex"].map((ix) => {
              const rows = report.sessions.map((s) => s.byIndex.find((b) => b.index === ix)).filter((r): r is { index: string; qualifyingRounds: number; sessionQualifies: boolean } => Boolean(r));
              const qualifying = rows.filter((r) => r.sessionQualifies).length;
              return <Stat key={ix} label={ix.toUpperCase()} value={`${qualifying}/5 qualifying sessions`} tone={qualifying >= 5 ? "bull" : "warn"} />;
            })}
          </div>
        ) : (
          <p className="text-sm text-amber-300">No research report found.</p>
        )}
        <p className="text-xs text-zinc-500">The protocol requires five qualifying sessions per index. Below five, the data is insufficient for validation.</p>
      </Card>

      <Card className="space-y-3 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs uppercase tracking-wider text-zinc-400">Synthetic demonstration — model payoff at expiry</div>
          <Badge tone="warn">SYNTHETIC — NOT MARKET DATA</Badge>
        </div>
        {payoff ? (
          <div className="space-y-2">
            <div className="font-semibold text-zinc-100">{payoff.optionType} {payoff.strike} · {payoff.lots} lot(s) · qty {payoff.quantity} · entry ₹{num(payoff.entryPremium)} · stop ₹{num(payoff.stopPremium)} · target ₹{num(payoff.targetPremium)}</div>
            <PayoffSvg premium={payoff.entryPremium} strike={payoff.strike} type={payoff.optionType} spot={payoff.strike} />
            <div className="font-mono text-xs">max planned loss ₹{Math.round(payoff.maxPlannedLoss)} · charges ₹{payoff.charges.total.toFixed(0)} · R:R {num(payoff.rewardToRisk)} · delta {num(payoff.greeks.delta)} · IV {num(payoff.greeks.iv * 100, 1)}% · theta/day {num(payoff.greeks.theta)}</div>
            <ul className="list-disc pl-5 text-xs text-zinc-400">{payoff.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            <ul className="list-disc pl-5 text-xs text-amber-300">{payoff.dataQuality.map((r) => <li key={r}>{r}</li>)}</ul>
            <p className="text-xs text-zinc-500">Payoff is the intrinsic value at expiry less premium, per unit. It ignores time value before expiry, charges and slippage. The stop is a price trigger, not a guaranteed maximum loss.</p>
          </div>
        ) : (
          <p>Synthetic demonstration not available.</p>
        )}
      </Card>

      <Card className="space-y-1 p-4 text-xs text-zinc-500">
        <p>Sizing uses an assumed ₹{ASSUMED_CAPITAL.toLocaleString("en-IN")} capital placeholder, not the user&apos;s account. Charges are assumptions pending verification. Greeks are Black-Scholes model outputs, not market observations.</p>
        <p>Recommendation-only. You make every trading decision. No order is placed by this application.</p>
      </Card>
    </div>
  );
}
