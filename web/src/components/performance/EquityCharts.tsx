"use client";

import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Pt = { timestamp: string; equity: number; realizedPnL: number; unrealizedPnL: number; drawdown: number; drawdownPercent: number };

const ist = (iso: string, date = true) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: date ? "2-digit" : undefined, month: date ? "short" : undefined, hour: "2-digit", minute: "2-digit", hour12: false });
const inr = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const axis = { stroke: "#52525b", tick: { fill: "#a1a1aa", fontSize: 11 } };
const tip = { contentStyle: { background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }, labelStyle: { color: "#a1a1aa" } };

// Two separate charts (equity, drawdown) rather than one overloaded chart. Single series each: no legend box.
export function EquityCharts({ points, basis, initial }: { points: Pt[]; basis: string; initial: number }) {
  if (points.length < 2) return <p className="py-8 text-center text-sm text-zinc-500">Not enough equity points to chart.</p>;
  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Equity ({basis === "MARK_TO_MARKET" ? "marked to model price at each bar" : "realized exits only (filtered view)"})
        </h3>
        <div className="h-64" role="img" aria-label="Simulated equity curve">
          <ResponsiveContainer>
            <LineChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#27272a" vertical={false} />
              <XAxis dataKey="timestamp" tickFormatter={(t) => ist(t)} minTickGap={50} {...axis} />
              <YAxis domain={["auto", "auto"]} tickFormatter={inr} width={80} {...axis} />
              <Tooltip
                {...tip}
                labelFormatter={(t) => `${ist(String(t))} IST`}
                formatter={(v, _n, item) => {
                  const p = item.payload as Pt;
                  return [`${inr(Number(v))} (P&L ${inr(p.equity - initial)}, DD ${p.drawdownPercent}%)`, "Equity"];
                }}
              />
              <Line dataKey="equity" stroke="#3987e5" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">Drawdown from peak (%)</h3>
        <div className="h-40" role="img" aria-label="Drawdown percentage from running equity peak">
          <ResponsiveContainer>
            <AreaChart data={points.map((p) => ({ ...p, dd: -p.drawdownPercent }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#27272a" vertical={false} />
              <XAxis dataKey="timestamp" tickFormatter={(t) => ist(t)} minTickGap={50} {...axis} />
              <YAxis tickFormatter={(v) => `${v}%`} width={80} {...axis} />
              <Tooltip {...tip} labelFormatter={(t) => `${ist(String(t))} IST`} formatter={(v, _n, item) => [`${v}% (₹${(item.payload as Pt).drawdown.toLocaleString("en-IN")})`, "Drawdown"]} />
              <Area dataKey="dd" stroke="#e66767" fill="#e66767" fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
