import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getTradingViewSymbol, getTradingViewChartUrl, getTradingViewWidgetEmbedUrl } from "./tradingView.ts";

describe("tradingView helper", () => {
  it("resolves major Indian index symbols correctly", () => {
    assert.equal(getTradingViewSymbol("NIFTY"), "NSE:NIFTY");
    assert.equal(getTradingViewSymbol("NIFTY 50"), "NSE:NIFTY");
    assert.equal(getTradingViewSymbol("BANKNIFTY"), "NSE:BANKNIFTY");
    assert.equal(getTradingViewSymbol("NIFTY BANK"), "NSE:BANKNIFTY");
    assert.equal(getTradingViewSymbol("FINNIFTY"), "NSE:FINNIFTY");
    assert.equal(getTradingViewSymbol("MIDCPNIFTY"), "NSE:MIDCPNIFTY");
    assert.equal(getTradingViewSymbol("SENSEX"), "BSE:SENSEX");
  });

  it("resolves equity stocks correctly", () => {
    assert.equal(getTradingViewSymbol("RELIANCE"), "NSE:RELIANCE");
    assert.equal(getTradingViewSymbol("TCS"), "NSE:TCS");
    assert.equal(getTradingViewSymbol("HDFCBANK"), "NSE:HDFCBANK");
    assert.equal(getTradingViewSymbol("NSE:INFY"), "NSE:INFY");
  });

  it("handles Upstox instrument keys with pipes", () => {
    assert.equal(getTradingViewSymbol("NSE_INDEX|Nifty 50"), "NSE:NIFTY");
    assert.equal(getTradingViewSymbol("NSE_INDEX|Nifty Bank"), "NSE:BANKNIFTY");
  });

  it("generates correct deep-link TradingView chart URLs", () => {
    const url = getTradingViewChartUrl("NIFTY", "15");
    assert.match(url, /^https:\/\/www\.tradingview\.com\/chart\/\?symbol=NSE%3ANIFTY&interval=15$/);
  });

  it("generates correct TradingView embed URLs", () => {
    const embed = getTradingViewWidgetEmbedUrl("BANKNIFTY", "5");
    assert.match(embed, /^https:\/\/s\.tradingview\.com\/widgetembed\/\?/);
    assert.match(embed, /symbol=NSE%3ABANKNIFTY/);
    assert.match(embed, /interval=5/);
    assert.match(embed, /theme=dark/);
  });
});
