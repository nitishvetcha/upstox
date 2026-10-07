import Link from "next/link";
import type { ReactNode } from "react";
import type { DashboardView } from "@/lib/dashboard";
import { fmtIst } from "@/lib/time";
import { Badge, Card, Stat, num, signed } from "./ui";

// Display only: every value comes from DashboardView (the backend analysis). null → "N/A", never 0.
const na = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? "N/A" : num(v, d));
const ist = (iso: string | null) => (iso ? `${fmtIst(iso)} IST` : "N/A");

function Panel({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{title}</h2>
        {right}
      </div>
      {children}
    </Card>
  );
}
const Grid = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">{children}</div>;

export function IndexSwitch({ index, base }: { index: string; base: string }) {
  return (
    <div className="flex gap-2 text-xs">
      {[["nifty", "NIFTY"], ["banknifty", "BANK NIFTY"]].map(([id, label]) => (
        <Link key={id} href={`${base}?index=${id}`} className={`rounded border px-3 py-1 font-semibold ${index === id ? "border-zinc-500 bg-zinc-800 text-zinc-100" : "border-zinc-800 text-zinc-400 hover:bg-zinc-900"}`}>
          {label}
        </Link>
      ))}
    </div>
  );
}

export function MarketPanel({ v }: { v: DashboardView }) {
  const m = v.market;
  return (
    <Panel title={`Market · ${v.name}`} right={<div className="flex gap-1"><Badge>{`MARKET ${m.status}`}</Badge><Badge tone={m.freshness === "LIVE" ? "neutral" : "warn"}>{`DATA ${m.freshness}`}</Badge></div>}>
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-mono text-3xl font-semibold tabular-nums text-zinc-50">{na(m.spot)}</span>
        <span className={`font-mono text-sm ${m.change === null ? "text-zinc-500" : m.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {m.change === null ? "N/A" : `${signed(m.change)} (${signed(m.changePercent ?? 0)}%)`}
        </span>
      </div>
      <div className="mt-3"><Grid>
        <Stat label="Bias" value={v.analysis.bias} />
        <Stat label="Regime" value={v.analysis.regime} />
        <Stat label="Score" value={`${v.analysis.score}/100`} />
        <Stat label="Trend (15m)" value={v.analysis.trend?.replace("_", " ") ?? "N/A"} />
        <Stat label="Volatility" value={v.analysis.volatilityRegime ?? "N/A"} />
        <Stat label="Sentiment" value={v.analysis.sentiment.available ? `${signed(v.analysis.sentiment.score)}${v.analysis.sentiment.confidence === null ? "" : ` · ${Math.round(v.analysis.sentiment.confidence * 100)}% conf.`}` : "N/A"} />
        <Stat label="Last market data" value={ist(v.timestamps.lastMarketData)} />
        <Stat label="Analysis generated" value={ist(v.timestamps.analysisGeneratedAt)} />
        <Stat label="Expiry" value={m.expiry} />
      </Grid></div>
    </Panel>
  );
}

export function TechnicalsPanel({ v }: { v: DashboardView }) {
  const t = v.technicals;
  return (
    <Panel title="Technicals (15m)">
      <Grid>
        <Stat label="RSI 14" value={na(t.rsi, 1)} />
        <Stat label="VWAP (index)" value={t.vwap === null ? "N/A (index has no volume)" : na(t.vwap)} />
        <Stat label="Futures VWAP" value={na(t.futuresVwap)} />
        <Stat label="ATR 15m / daily" value={`${na(t.atr15m, 1)} / ${na(t.atrDaily, 0)}`} />
        <Stat label="EMA 9 / 21" value={`${na(t.ema9, 0)} / ${na(t.ema21, 0)}`} />
        <Stat label="EMA 50 / 200" value={`${na(t.ema50, 0)} / ${na(t.ema200, 0)}`} />
        <Stat label="MACD histogram" value={t.macdHist === null ? "N/A" : signed(t.macdHist, 1)} />
        <Stat label="Prev day H / L" value={`${na(t.pdh, 0)} / ${na(t.pdl, 0)}`} />
        <Stat label="Prev day close" value={na(t.pdc, 0)} />
        <Stat label="Opening range" value={t.orHigh === null || t.orLow === null ? "N/A (forms 09:15–09:30)" : `${na(t.orLow, 0)} – ${na(t.orHigh, 0)}`} />
      </Grid>
    </Panel>
  );
}

export function OptionsPanel({ v }: { v: DashboardView }) {
  const o = v.options;
  const oiNa = o.oiAvailable ? null : "Unavailable";
  return (
    <Panel title="Option analysis" right={!o.oiAvailable && <Badge tone="warn">OI NOT AVAILABLE</Badge>}>
      <Grid>
        <Stat label="PCR (OI)" value={oiNa ?? na(o.pcr)} />
        <Stat label="PCR (volume)" value={oiNa ?? na(o.pcrVolume)} />
        <Stat label="Max pain" value={oiNa ?? na(o.maxPain, 0)} />
        <Stat label="Call OI" value={oiNa ?? na(o.callOi, 0)} />
        <Stat label="Put OI" value={oiNa ?? na(o.putOi, 0)} />
        <Stat label="Call / Put OI change" value={`${o.callOiChange === null ? "N/A" : signed(o.callOiChange, 0)} / ${o.putOiChange === null ? "N/A" : signed(o.putOiChange, 0)}`} />
        <Stat label="ATM strike" value={na(o.atmStrike, 0)} />
        <Stat label="ATM IV" value={o.atmIv === null ? "N/A" : `${num(o.atmIv, 1)}%`} />
        <Stat label="IV percentile" value={o.ivPercentile === null ? "N/A (no IV history)" : String(o.ivPercentile)} />
        <Stat label="Expected move" value={o.expectedMove === null ? "N/A" : `±${num(o.expectedMove, 0)}`} />
      </Grid>
    </Panel>
  );
}

export function LevelsPanel({ v }: { v: DashboardView }) {
  const l = v.levels;
  return (
    <Panel title="Support / resistance">
      <Grid>
        <Stat label="Resistance (max call OI)" value={na(l.resistance, 0)} tone="bear" />
        <Stat label="Spot" value={na(l.spot)} />
        <Stat label="Support (max put OI)" value={na(l.support, 0)} tone="bull" />
        <Stat label="Resistance (fresh call OI)" value={na(l.resistanceByOiChange, 0)} />
        <Stat label="Prev day high / low" value={`${na(l.pdh, 0)} / ${na(l.pdl, 0)}`} />
        <Stat label="Support (fresh put OI)" value={na(l.supportByOiChange, 0)} />
      </Grid>
    </Panel>
  );
}

export function RiskPanel({ v }: { v: DashboardView }) {
  const r = v.risk;
  const L = r.limits;
  return (
    <Panel title="Risk" right={<Badge tone={r.approval === "RISK APPROVED" ? "bull" : "warn"}>{r.approval}</Badge>}>
      <p className="mb-3 text-xs text-zinc-500">{r.basis}</p>
      <Grid>
        <Stat label="Risk per trade" value={`${L.riskPerTradePercent}%`} />
        <Stat label="Daily loss limit" value={`${L.maxDailyLossPercent}%`} />
        <Stat label="Max open risk" value={`${L.maxOpenRiskPercent}%`} />
        <Stat label="Max position value" value={`${L.maxPositionValuePercent}%`} />
        <Stat label="Max lots / trade" value={String(L.maxLotsPerTrade)} />
        <Stat label="Concurrent positions" value={String(L.maxConcurrentPositions)} />
        <Stat label="Minimum R:R" value={`1 : ${L.minRiskReward}`} />
        <Stat label="Capital" value={`₹${num(L.accountCapital, 0)}`} />
        <Stat label="Lots (qty)" value={r.lots === null ? "N/A" : `${r.lots} (${r.quantity})`} />
        <Stat label="Stop risk" value={r.totalRisk === null ? "N/A" : `₹${num(r.totalRisk, 0)} (${r.riskPercent}%)`} />
      </Grid>
      {r.reasons.length > 0 && <ul className="mt-3 space-y-1 text-xs text-amber-400">{r.reasons.map((x) => <li key={x}>• {x}</li>)}</ul>}
    </Panel>
  );
}

export function DataQualityPanel({ v }: { v: DashboardView }) {
  return (
    <Panel title="Data quality">
      <dl className="grid grid-cols-[8rem_1fr] gap-y-1 font-mono text-xs">
        {Object.entries(v.dataQuality).map(([k, q]) => (
          <div key={k} className="contents">
            <dt className="text-zinc-400">{k}</dt>
            <dd className={q === "LIVE" ? "text-zinc-200" : "text-amber-400"}>{q}</dd>
          </div>
        ))}
        <dt className="text-zinc-400">open interest</dt>
        <dd className={v.options.oiAvailable ? "text-zinc-200" : "text-amber-400"}>{v.options.oiAvailable ? v.dataQuality.optionChain : "NOT_AVAILABLE"}</dd>
      </dl>
      <p className="mt-2 text-[11px] text-zinc-500">Live dashboard: values as delivered by Upstox (or labeled MOCK fallback). Backtest data quality is shown per run on the Backtest / Performance pages.</p>
    </Panel>
  );
}

export function RecommendationSummary({ v }: { v: DashboardView }) {
  const r = v.recommendation;
  const dash = (x: number | null) => (x === null ? "—" : num(x));
  return (
    <Panel title="Recommendation of the day" right={<Badge>{r.status}</Badge>}>
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="text-xl font-semibold text-zinc-100">{r.strategy ?? (r.status === "WAIT" ? "WAIT" : "NO TRADE")}</span>
        <span className="text-xs text-zinc-500">Confidence {r.confidence}% (model confidence, not probability of profit)</span>
      </div>
      {r.noPlanMessage && <p className="mt-1 text-sm text-zinc-400">{r.noPlanMessage}</p>}
      {!r.executable && r.strategy && <p className="mt-1 text-xs text-amber-400">Execution disabled: {r.status !== "TRADE" ? `status is ${r.status}` : `market data is ${v.market.freshness}`}.</p>}
      <div className="mt-3"><Grid>
        <Stat label="Entry" value={dash(r.entry)} />
        <Stat label="Stop loss" value={dash(r.stopLoss)} />
        <Stat label="Risk / reward" value={r.riskReward === null ? "—" : `1 : ${num(r.riskReward)}`} />
        <Stat label="Target 1" value={dash(r.target1)} />
        <Stat label="Target 2" value={dash(r.target2)} />
        <Stat label="Breakeven" value={r.breakevens.length ? r.breakevens.map((b) => num(b)).join(" / ") : "—"} />
        <Stat label="Max loss" value={dash(r.maxLoss)} />
        <Stat label="Max profit" value={r.strategy && r.maxProfit === null ? "Open-ended" : dash(r.maxProfit)} />
      </Grid></div>
      {r.reasons.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">Reasons</div>
          <ul className="mt-1 space-y-1 text-sm text-amber-400">{r.reasons.map((x) => <li key={x}>• {x}</li>)}</ul>
        </div>
      )}
      {r.risks.length > 0 && <ul className="mt-2 space-y-1 text-xs text-amber-300">{r.risks.map((x) => <li key={x}>⚠ {x}</li>)}</ul>}
      <div className="mt-4 space-y-1.5">
        {v.factors.map((f) => (
          <div key={f.key} className="grid grid-cols-[9.5rem_1fr_3.5rem] items-center gap-2 text-xs">
            <span className="text-zinc-400">{f.label}</span>
            <div className="h-1.5 rounded bg-zinc-800"><div className="h-1.5 rounded bg-zinc-400" style={{ width: `${f.available ? (f.score / f.max) * 100 : 0}%` }} /></div>
            <span className="text-right font-mono tabular-nums text-zinc-300">{f.available ? `${num(f.score, 1)}/${f.max}` : "N/A"}</span>
          </div>
        ))}
        <div className="grid grid-cols-[9.5rem_1fr_3.5rem] gap-2 border-t border-zinc-800 pt-1 text-xs"><span className="text-zinc-300">Overall</span><span /><span className="text-right font-mono text-zinc-100">{v.analysis.score}/100</span></div>
      </div>
    </Panel>
  );
}

export function SectionError({ title, error }: { title: string; error: unknown }) {
  return (
    <Card className="border-amber-500/40 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-400">{title} unavailable</h2>
      <p className="mt-1 text-sm text-zinc-400">{error instanceof Error ? error.message : String(error)}</p>
    </Card>
  );
}
