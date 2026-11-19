"use client";

import { useEffect, useRef } from "react";
import { createChart, createSeriesMarkers, CandlestickSeries, LineSeries, type IChartApi, type UTCTimestamp } from "lightweight-charts";

// TradingView Lightweight Charts (Apache-2.0). The library's attribution logo is left enabled.
export interface Candle { time: number; open: number; high: number; low: number; close: number }
export interface Point { time: number; value: number }
export interface Overlay { name: string; color: string; data: Point[] }
export interface Mark { time: number; side: "LONG" | "SHORT"; kind: "ENTRY" | "EXIT"; text: string }
export interface Level { price: number; color: string; title: string }

export function CandleChart({ candles, overlays, marks, levels, height = 420 }: { candles: Candle[]; overlays: Overlay[]; marks: Mark[]; levels: Level[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || candles.length === 0) return;
    const chart: IChartApi = createChart(el, {
      height,
      layout: { background: { color: "#09090b" }, textColor: "#a1a1aa" },
      grid: { vertLines: { color: "#18181b" }, horzLines: { color: "#18181b" } },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: "#27272a" },
      rightPriceScale: { borderColor: "#27272a" },
    });
    const price = chart.addSeries(CandlestickSeries, { upColor: "#34d399", downColor: "#f87171", borderVisible: false, wickUpColor: "#34d399", wickDownColor: "#f87171" });
    price.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })));
    for (const o of overlays) {
      if (o.data.length === 0) continue;
      const line = chart.addSeries(LineSeries, { color: o.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: o.name });
      line.setData(o.data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    }
    for (const l of levels) {
      price.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: l.title });
    }
    if (marks.length) {
      createSeriesMarkers(
        price,
        marks
          .slice()
          .sort((a, b) => a.time - b.time)
          .map((m) => ({
            time: m.time as UTCTimestamp,
            position: m.kind === "ENTRY" ? (m.side === "LONG" ? "belowBar" : "aboveBar") : m.side === "LONG" ? "aboveBar" : "belowBar",
            color: m.kind === "ENTRY" ? "#38bdf8" : "#e4e4e7",
            shape: m.kind === "ENTRY" ? (m.side === "LONG" ? "arrowUp" : "arrowDown") : "circle",
            text: m.text,
          })),
      );
    }
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [candles, overlays, marks, levels, height]);
  return <div ref={ref} className="w-full" style={{ minWidth: 0 }} aria-label="candlestick chart" />;
}
