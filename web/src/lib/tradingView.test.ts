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
    assert.equal(getTradingViewSymbol("BANKEX"), "BSE:BANKEX");
    assert.equal(getTradingViewSymbol("BSE BANKEX"), "BSE:BANKEX");
  });

  it("resolves MCX commodity symbols and variants to continuous futures", () => {
    assert.equal(getTradingViewSymbol("CRUDEOIL"), "MCX:CRUDEOIL1!");
    assert.equal(getTradingViewSymbol("CRUDE OIL"), "MCX:CRUDEOIL1!");
    assert.equal(getTradingViewSymbol("crudeoil"), "MCX:CRUDEOIL1!");
    assert.equal(getTradingViewSymbol("CRUDEOILM"), "MCX:CRUDEOIL1!");
    assert.equal(getTradingViewSymbol("MCX:CRUDEOIL"), "MCX:CRUDEOIL1!");
    assert.equal(getTradingViewSymbol("MCX:CRUDEOIL1!"), "MCX:CRUDEOIL1!");

    assert.equal(getTradingViewSymbol("NATURALGAS"), "MCX:NATURALGAS1!");
    assert.equal(getTradingViewSymbol("NATURAL GAS"), "MCX:NATURALGAS1!");
    assert.equal(getTradingViewSymbol("naturalgas"), "MCX:NATURALGAS1!");
    assert.equal(getTradingViewSymbol("NATGASMINI"), "MCX:NATURALGAS1!");
    assert.equal(getTradingViewSymbol("MCX:NATURALGAS"), "MCX:NATURALGAS1!");
    assert.equal(getTradingViewSymbol("MCX:NATURALGAS1!"), "MCX:NATURALGAS1!");

    assert.equal(getTradingViewSymbol("GOLD"), "MCX:GOLD1!");
    assert.equal(getTradingViewSymbol("SILVER"), "MCX:SILVER1!");
  });

  it("resolves complex option and spread names to their underlying", () => {
    assert.equal(getTradingViewSymbol("NATURALGAS 245/270 CE Spread"), "MCX:NATURALGAS1!");
    assert.equal(getTradingViewSymbol("NATURALGAS 330 CE 23 DEC 26"), "MCX:NATURALGAS1!");
    assert.equal(getTradingViewSymbol("CRUDEOIL 7500 CE 16 DEC 26"), "MCX:CRUDEOIL1!");
    assert.equal(getTradingViewSymbol("NIFTY 24500 CE 28 NOV 24"), "NSE:NIFTY");
    assert.equal(getTradingViewSymbol("BANKNIFTY 52000 PE"), "NSE:BANKNIFTY");
    assert.equal(getTradingViewSymbol("BANKEX 59000 CE"), "BSE:BANKEX");
  });

  it("resolves equity stocks and sanitizes special characters", () => {
    assert.equal(getTradingViewSymbol("RELIANCE"), "NSE:RELIANCE");
    assert.equal(getTradingViewSymbol("TCS"), "NSE:TCS");
    assert.equal(getTradingViewSymbol("HDFCBANK"), "NSE:HDFCBANK");
    assert.equal(getTradingViewSymbol("NSE:INFY"), "NSE:INFY");
    assert.equal(getTradingViewSymbol("M&M"), "NSE:M_M");
    assert.equal(getTradingViewSymbol("BAJAJ-AUTO"), "NSE:BAJAJ_AUTO");
  });

  it("handles Upstox instrument keys with pipes and ISINs", () => {
    assert.equal(getTradingViewSymbol("NSE_INDEX|Nifty 50"), "NSE:NIFTY");
    assert.equal(getTradingViewSymbol("NSE_INDEX|Nifty Bank"), "NSE:BANKNIFTY");
    assert.equal(getTradingViewSymbol("BSE_INDEX|BANKEX"), "BSE:BANKEX");
    assert.equal(getTradingViewSymbol("BSE_INDEX|SENSEX"), "BSE:SENSEX");
    assert.equal(getTradingViewSymbol("MCX_FO|576264"), "MCX:CRUDEOIL1!");
    assert.equal(getTradingViewSymbol("MCX_FO|578249"), "MCX:NATURALGAS1!");
    assert.equal(getTradingViewSymbol("NSE_EQ|INE002A01018"), "NSE:RELIANCE");
    assert.equal(getTradingViewSymbol("INE002A01018"), "NSE:RELIANCE");
  });

  it("generates correct deep-link TradingView chart URLs for indices and commodities", () => {
    const niftyUrl = getTradingViewChartUrl("NIFTY", "15");
    assert.equal(niftyUrl, "https://www.tradingview.com/chart/?symbol=NSE%3ANIFTY&interval=15");

    const crudeUrl = getTradingViewChartUrl("CRUDEOIL", "15");
    assert.equal(crudeUrl, "https://www.tradingview.com/chart/?symbol=MCX%3ACRUDEOIL1!&interval=15");

    const ngUrl = getTradingViewChartUrl("NATURALGAS", "15");
    assert.equal(ngUrl, "https://www.tradingview.com/chart/?symbol=MCX%3ANATURALGAS1!&interval=15");

    const bankexUrl = getTradingViewChartUrl("BANKEX", "15");
    assert.equal(bankexUrl, "https://www.tradingview.com/chart/?symbol=BSE%3ABANKEX&interval=15");
  });

  it("generates correct TradingView embed URLs", () => {
    const embed = getTradingViewWidgetEmbedUrl("BANKNIFTY", "5");
    assert.match(embed, /^https:\/\/s\.tradingview\.com\/widgetembed\/\?/);
    assert.match(embed, /symbol=NSE%3ABANKNIFTY/);
    assert.match(embed, /interval=5/);
    assert.match(embed, /theme=dark/);

    const embedCrude = getTradingViewWidgetEmbedUrl("CRUDEOIL", "15");
    assert.match(embedCrude, /symbol=MCX%3ACRUDEOIL1%21/);
  });
});
