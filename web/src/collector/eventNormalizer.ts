// Market Data Collector — Modules 6 & 7: Event Normalizer, Provenance & Dual-Timestamping
// Implements WBS 4.3 and complies with COLLECTOR_ARCHITECTURE_SPECIFICATION.md & COLLECTOR_DATA_SCHEMA.md.

import { randomUUID } from "node:crypto";
import type {
  BaseEventHeader,
  BestBidAskEvent,
  CanonicalMarketEvent,
  DepthLevel,
  GreeksEvent,
  LTPCEvent,
  MarketDataProvenance,
  MarketDepthEvent,
  OpenInterestEvent,
} from "./collectorTypes.ts";

export interface NormalizationContext {
  connectionId: string;
  localReceiptMonoNs: bigint;
  localReceiptUtcMs: number;
}

interface LastKnownState {
  feedServerTs: number | null;
  lastTradeTs: number | null;
  ltp: number | null;
  depthSummary: string;
}

export class EventNormalizer {
  private lastKnownStates = new Map<string, LastKnownState>(); // instrumentKey -> LastKnownState

  /**
   * Normalizes raw decoded feeds from FeedResponse into typed CanonicalMarketEvents.
   */
  public normalizeFeedResponse(
    decoded: Record<string, unknown>,
    ctx: NormalizationContext
  ): CanonicalMarketEvent[] {
    const feedServerTs = typeof decoded.currentTs === "number" ? decoded.currentTs : null;
    const localReceiptUtcIso = new Date(ctx.localReceiptUtcMs).toISOString();

    // Calculate transport latency: localUtcMs - feedServerTs
    let transportLatencyMs: number | null = null;
    const baseFlags: string[] = [];

    if (feedServerTs !== null) {
      transportLatencyMs = ctx.localReceiptUtcMs - feedServerTs;
      if (transportLatencyMs < -500 || transportLatencyMs > 5000) {
        baseFlags.push("SUSPECT_CLOCK_SKEW");
      }
    }

    const feeds = (decoded.feeds ?? {}) as Record<string, Record<string, unknown>>;
    const events: CanonicalMarketEvent[] = [];

    for (const [instrumentKey, feed] of Object.entries(feeds)) {
      const full = feed.fullFeed as Record<string, unknown> | undefined;
      const mff = full?.marketFF as Record<string, unknown> | undefined;
      const flg = feed.firstLevelWithGreeks as Record<string, unknown> | undefined;
      const indexFF = full?.indexFF as Record<string, unknown> | undefined;
      const ltpcRaw = (mff?.ltpc ?? flg?.ltpc ?? indexFF?.ltpc ?? feed.ltpc ?? {}) as Record<string, unknown>;

      const isIndex = instrumentKey.startsWith("NSE_INDEX") || Boolean(indexFF);

      // 1. Process LTPC (Trade / Spot Price)
      const ltp = typeof ltpcRaw.ltp === "number" ? ltpcRaw.ltp : null;
      const ltq = typeof ltpcRaw.ltq === "number" ? ltpcRaw.ltq : null;
      const lastTradeTs = typeof ltpcRaw.ltt === "number" ? ltpcRaw.ltt : null;
      const sessionVolume = typeof mff?.vtt === "number" ? mff.vtt : typeof flg?.vtt === "number" ? flg.vtt : null;
      const closePrice = typeof ltpcRaw.cp === "number" ? ltpcRaw.cp : null;

      const provenance: MarketDataProvenance = isIndex
        ? "EXCHANGE_INDEX_CALCULATION"
        : "EXCHANGE_MATCHING_ENGINE";

      // 2. Process Depth Levels
      const rawQuotes = (
        (mff?.marketLevel as { bidAskQuote?: unknown[] } | undefined)?.bidAskQuote ?? []
      ) as Array<{ bidP?: number; bidQ?: number; askP?: number; askQ?: number }>;

      const levels: [DepthLevel, DepthLevel, DepthLevel, DepthLevel, DepthLevel] = [
        this.makeLevel(1, rawQuotes[0]),
        this.makeLevel(2, rawQuotes[1]),
        this.makeLevel(3, rawQuotes[2]),
        this.makeLevel(4, rawQuotes[3]),
        this.makeLevel(5, rawQuotes[4]),
      ];

      const bestBid = levels[0].bidPrice;
      const bestAsk = levels[0].askPrice;
      const depthSummary = `${bestBid ?? "x"}/${bestAsk ?? "x"}`;

      // Check for heuristic duplicate / retransmission
      const lastState = this.lastKnownStates.get(instrumentKey);
      const isCandidateDuplicate =
        lastState !== undefined &&
        lastState.feedServerTs === feedServerTs &&
        lastState.lastTradeTs === lastTradeTs &&
        lastState.ltp === ltp &&
        lastState.depthSummary === depthSummary;

      this.lastKnownStates.set(instrumentKey, {
        feedServerTs,
        lastTradeTs,
        ltp,
        depthSummary,
      });

      const qualityFlags = [...baseFlags];
      if (isCandidateDuplicate) {
        qualityFlags.push("POSSIBLE_RETRANSMISSION");
      }
      if (rawQuotes.length > 0 && rawQuotes.length < 5) {
        qualityFlags.push("PARTIAL_DEPTH");
      }
      if (bestBid !== null && bestAsk !== null && bestBid >= bestAsk) {
        qualityFlags.push("CROSSED_BOOK");
      }

      const header: BaseEventHeader = {
        schemaVersion: "1.0.0",
        eventId: randomUUID(),
        instrumentKey,
        connectionId: ctx.connectionId,
        provenance,
        localReceiptMonoNs: ctx.localReceiptMonoNs,
        localReceiptUtcIso,
        feedServerTs,
        transportLatencyMs,
        qualityFlags,
      };

      // Emit LTPC Event
      const ltpcEvent: LTPCEvent = {
        ...header,
        eventType: "LTPC",
        provenance,
        ltp,
        ltq,
        lastTradeTs,
        sessionVolume: isIndex ? null : sessionVolume,
        closePrice,
      };
      events.push(ltpcEvent);

      // 3. Emit Best Bid/Ask Top of Book Event (Derivatives only)
      if (!isIndex && (bestBid !== null || bestAsk !== null || rawQuotes.length > 0)) {
        const bestBidPrice = levels[0].bidPrice;
        const bestBidQuantity = levels[0].bidQuantity;
        const bestAskPrice = levels[0].askPrice;
        const bestAskQuantity = levels[0].askQuantity;

        let spreadPct: number | null = null;
        if (bestBidPrice !== null && bestAskPrice !== null && bestBidPrice > 0 && bestAskPrice > 0) {
          const mid = (bestBidPrice + bestAskPrice) / 2;
          spreadPct = (bestAskPrice - bestBidPrice) / mid;
        }

        const bbaEvent: BestBidAskEvent = {
          ...header,
          eventId: randomUUID(),
          eventType: "BEST_BID_ASK",
          provenance: "EXCHANGE_ORDER_BOOK",
          bestBidPrice,
          bestBidQuantity,
          bestAskPrice,
          bestAskQuantity,
          spreadPct,
          quoteSourceTs: "UNKNOWN",
        };
        events.push(bbaEvent);

        // 4. Emit 5-Level Depth Event
        let totalBidQty: number | null = null;
        let totalAskQty: number | null = null;
        for (const l of levels) {
          if (l.bidQuantity !== null) totalBidQty = (totalBidQty ?? 0) + l.bidQuantity;
          if (l.askQuantity !== null) totalAskQty = (totalAskQty ?? 0) + l.askQuantity;
        }

        const depthEvent: MarketDepthEvent = {
          ...header,
          eventId: randomUUID(),
          eventType: "MARKET_DEPTH",
          provenance: "EXCHANGE_ORDER_BOOK",
          levels,
          totalBidQty,
          totalAskQty,
        };
        events.push(depthEvent);
      }

      // 5. Emit Greeks Event (if present)
      const rawGreeks = (mff?.optionGreeks ?? flg?.optionGreeks) as Record<string, number> | undefined;
      const rawIv = typeof mff?.iv === "number" ? mff.iv : typeof flg?.iv === "number" ? flg.iv : null;

      if (rawGreeks || rawIv !== null) {
        const greeksEvent: GreeksEvent = {
          ...header,
          eventId: randomUUID(),
          eventType: "OPTION_GREEKS",
          provenance: "UPSTOX_SUPPLIED_GREEKS",
          iv: rawIv,
          delta: typeof rawGreeks?.delta === "number" ? rawGreeks.delta : null,
          gamma: typeof rawGreeks?.gamma === "number" ? rawGreeks.gamma : null,
          theta: typeof rawGreeks?.theta === "number" ? rawGreeks.theta : null,
          vega: typeof rawGreeks?.vega === "number" ? rawGreeks.vega : null,
          rho: typeof rawGreeks?.rho === "number" ? rawGreeks.rho : null,
          underlyingSpotPriceRef: typeof rawGreeks?.spotPrice === "number" ? rawGreeks.spotPrice : null,
          greekCalculationTs: "UNKNOWN",
        };
        events.push(greeksEvent);
      }

      // 6. Emit Open Interest Event (if present)
      const rawOi = typeof mff?.oi === "number" ? mff.oi : typeof flg?.oi === "number" ? flg.oi : null;
      if (rawOi !== null && !isIndex) {
        const oiEvent: OpenInterestEvent = {
          ...header,
          eventId: randomUUID(),
          eventType: "OPEN_INTEREST",
          provenance: "PERIODIC_EXCHANGE_OI",
          openInterest: rawOi,
          oiChange: null, // absent from raw live stream
          oiBroadcastTs: "UNKNOWN",
        };
        events.push(oiEvent);
      }
    }

    return events;
  }

  private makeLevel(
    level: 1 | 2 | 3 | 4 | 5,
    q: { bidP?: number; bidQ?: number; askP?: number; askQ?: number } | undefined
  ): DepthLevel {
    return {
      level,
      bidPrice: typeof q?.bidP === "number" && q.bidP > 0 ? q.bidP : null,
      bidQuantity: typeof q?.bidQ === "number" && q.bidQ > 0 ? q.bidQ : null,
      bidOrders: null,
      askPrice: typeof q?.askP === "number" && q.askP > 0 ? q.askP : null,
      askQuantity: typeof q?.askQ === "number" && q.askQ > 0 ? q.askQ : null,
      askOrders: null,
    };
  }
}
