// TradingView Pine Script v5 Strategy Generator.
// Turnkey strategy script for TradingView.com's built-in Strategy Tester.
// Allows users to test the exact quantitative rules over TradingView's deep historical market data.

export interface PineScriptOptions {
  symbol?: string;
  orbStartHour?: number;
  orbStartMin?: number;
  orbEndHour?: number;
  orbEndMin?: number;
  rrTarget1?: number;
  rrTarget2?: number;
  atrBuffer?: number;
  cutoffHour?: number;
  cutoffMin?: number;
  thetaMaxBars?: number; // 3 bars on 15m = 45m
}

export function generateTradingViewPineScript(options?: PineScriptOptions): string {
  const symbol = options?.symbol ?? "NIFTY";
  const rr1 = options?.rrTarget1 ?? 1.5;
  const rr2 = options?.rrTarget2 ?? 2.5;
  const buffer = options?.atrBuffer ?? 0.15;
  const thetaBars = options?.thetaMaxBars ?? 3;

  return `//@version=5
strategy("Upstox Options Terminal - Strategy Validator v20.2 (${symbol})", overlay=true, initial_capital=100000, default_qty_type=strategy.percent_of_equity, default_qty_value=20, commission_type=strategy.commission.percent, commission_value=0.03)

// ==============================================================================
// 1. INPUT PARAMETERS
// ==============================================================================
orb_start_hour    = input.int(9, "ORB Start Hour (IST)", minval=0, maxval=23, group="Opening Range Breakout")
orb_start_min     = input.int(15, "ORB Start Minute", minval=0, maxval=59, group="Opening Range Breakout")
orb_end_hour      = input.int(9, "ORB End Hour (IST)", minval=0, maxval=23, group="Opening Range Breakout")
orb_end_min       = input.int(30, "ORB End Minute", minval=0, maxval=59, group="Opening Range Breakout")

ema_fast_len      = input.int(9, "Fast EMA Length", minval=1, group="Moving Averages")
ema_med_len       = input.int(21, "Medium EMA Length", minval=1, group="Moving Averages")
ema_slow_len      = input.int(50, "Slow EMA Length", minval=1, group="Moving Averages")

rr_target1        = input.float(${rr1}, "Target 1 (R:R Ratio)", minval=0.5, step=0.1, group="Risk Management")
rr_target2        = input.float(${rr2}, "Target 2 (R:R Ratio)", minval=1.0, step=0.1, group="Risk Management")
atr_len           = input.int(14, "ATR Length", minval=1, group="Risk Management")
atr_buffer        = input.float(${buffer}, "ATR Stop Buffer Multiplier", minval=0.0, step=0.05, group="Risk Management")

cutoff_hour       = input.int(15, "Square-Off Hour (IST)", minval=0, maxval=23, group="Intraday Session Rules")
cutoff_min        = input.int(15, "Square-Off Minute", minval=0, maxval=59, group="Intraday Session Rules")
max_bars_in_trade = input.int(${thetaBars}, "Max 15m Bars before Theta Time-Stop (45m)", minval=1, group="Intraday Session Rules")

// ==============================================================================
// 2. INDICATOR COMPUTATIONS
// ==============================================================================
ema9    = ta.ema(close, ema_fast_len)
ema21   = ta.ema(close, ema_med_len)
ema50   = ta.ema(close, ema_slow_len)
vwapVal = ta.vwap(close)
atrVal  = ta.atr(atr_len)

// Visual Overlays on TradingView Chart
plot(ema9, "EMA 9 (Fast)", color=color.new(#38bdf8, 0), linewidth=1)
plot(ema21, "EMA 21 (Trend)", color=color.new(#fbbf24, 0), linewidth=1)
plot(ema50, "EMA 50 (Institutional)", color=color.new(#c084fc, 0), linewidth=1)
plot(vwapVal, "Session VWAP", color=color.new(#f472b6, 0), linewidth=2)

// ==============================================================================
// 3. 15-MINUTE OPENING RANGE CALCULATION (IST: 09:15 - 09:30)
// ==============================================================================
var float orb_high = na
var float orb_low = na

is_new_day = ta.change(time("D")) != 0

// Convert UTC timestamp to IST minutes from midnight
// TradingView time is in Unix epoch ms; adjust +5:30 (330 min)
ist_time_min = (hour * 60 + minute + 330) % 1440
orb_start_total = orb_start_hour * 60 + orb_start_min
orb_end_total   = orb_end_hour * 60 + orb_end_min
cutoff_total    = cutoff_hour * 60 + cutoff_min

if is_new_day
    orb_high := na
    orb_low := na

if ist_time_min >= orb_start_total and ist_time_min < orb_end_total
    if na(orb_high) or high > orb_high
        orb_high := high
    if na(orb_low) or low < orb_low
        orb_low := low

plot(orb_high, "ORB High Level", color=color.new(color.emerald, 30), style=plot.style_linebr, linewidth=2)
plot(orb_low, "ORB Low Level", color=color.new(color.rose, 30), style=plot.style_linebr, linewidth=2)

// ==============================================================================
// 4. STRATEGY ENTRY SIGNALS & RISK MANAGEMENT
// ==============================================================================
can_trade = ist_time_min >= orb_end_total and ist_time_min < (14 * 60 + 30) and not na(orb_high) and not na(orb_low)

bullish_alignment = (close > vwapVal) and (ema9 > ema21)
bearish_alignment = (close < vwapVal) and (ema9 < ema21)

long_breakout  = can_trade and ta.crossover(close, orb_high) and bullish_alignment
short_breakout = can_trade and ta.crossunder(close, orb_low) and bearish_alignment

var int entry_bar = 0

if long_breakout and strategy.position_size == 0
    long_risk = close - (orb_low - atrVal * atr_buffer)
    long_stop = orb_low - atrVal * atr_buffer
    long_t1   = close + (long_risk * rr_target1)
    entry_bar := bar_index
    strategy.entry("Long", strategy.long, comment="ORB Bull Breakout")
    strategy.exit("Exit Long", "Long", stop=long_stop, limit=long_t1, comment_profit="Target 1 Hit", comment_loss="Stop Hit")

if short_breakout and strategy.position_size == 0
    short_risk = (orb_high + atrVal * atr_buffer) - close
    short_stop = orb_high + atrVal * atr_buffer
    short_t1   = close - (short_risk * rr_target1)
    entry_bar := bar_index
    strategy.entry("Short", strategy.short, comment="ORB Bear Breakdown")
    strategy.exit("Exit Short", "Short", stop=short_stop, limit=short_t1, comment_profit="Target 1 Hit", comment_loss="Stop Hit")

// ==============================================================================
// 5. INTRADAY TIME EXITS (45M THETA GUARD & 15:15 SQUARE-OFF)
// ==============================================================================
if strategy.position_size != 0
    // 45-minute Theta time stop (3 bars on 15m)
    if (bar_index - entry_bar) >= max_bars_in_trade
        strategy.close_all(comment="Theta 45m Guard Exit")
    // 15:15 IST Mandatory Intraday Square-off
    if ist_time_min >= cutoff_total
        strategy.close_all(comment="15:15 IST Square-Off")
`;
}
