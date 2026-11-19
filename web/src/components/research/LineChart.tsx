"use client";

import { useEffect, useRef } from "react";
import { createChart, AreaSeries, type UTCTimestamp } from "lightweight-charts";

// Lightweight Charts (Apache-2.0). Used for equity curve and drawdown from stored historical research results.
export function LineChart({ data, color, title, height = 220 }: { data: { time: number; value: number }[]; color: string; title: string; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || data.length === 0) return;
    const chart = createChart(el, {
      height,
      layout: { background: { color: "#09090b" }, textColor: "#a1a1aa" },
      grid: { vertLines: { color: "#18181b" }, horzLines: { color: "#18181b" } },
      timeScale: { timeVisible: true, borderColor: "#27272a" },
      rightPriceScale: { borderColor: "#27272a" },
    });
    const s = chart.addSeries(AreaSeries, { lineColor: color, topColor: `${color}33`, bottomColor: "#09090b00", lineWidth: 2, title });
    s.setData(data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [data, color, title, height]);
  return <div ref={ref} className="w-full" style={{ minWidth: 0 }} aria-label={title} />;
}
