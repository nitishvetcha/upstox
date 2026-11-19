// Data-quality presentation for stored daily index series. Facts come from the feasibility check of
// web/.research-data/upstox-clean-2026-11-06-v1 (see docs/INDEX_SERIES_FEASIBILITY_2026-11-08.md).
// These are presentation constants only. Original datasets are not modified and no backtest is implied.

export interface IndexHistoryQuality {
  index: string;
  rawFirstSession: string;       // first session in the stored clean series
  usableFrom: string;            // conservative start after placeholder and duplicate checks
  flatPlaceholderYears: string;  // where bars are flat (open = high = low = close) with zero volume; "" if none
  duplicateSessions: string[];   // sessions with two bars; "" list if none
  warnings: string[];
}

export const INDEX_HISTORY_QUALITY: IndexHistoryQuality[] = [
  { index: "NIFTY", rawFirstSession: "2000-01-03", usableFrom: "2000-01-03", flatPlaceholderYears: "", duplicateSessions: [], warnings: [] },
  {
    index: "BANKNIFTY", rawFirstSession: "2000-01-01", usableFrom: "2006-01-02",
    flatPlaceholderYears: "2000–2004 (all bars flat); 2005 partly (110 of 251)",
    duplicateSessions: ["2015-06-29", "2015-07-02", "2015-08-10", "2015-11-11"],
    warnings: ["Flat placeholder period before 2006", "Duplicate sessions in 2015"],
  },
  {
    index: "FINNIFTY", rawFirstSession: "2004-01-01", usableFrom: "2013-01-01",
    flatPlaceholderYears: "2004–2011 (all bars flat); 2012 partly (39 of 251)",
    duplicateSessions: ["2015-06-29", "2015-07-02", "2015-08-10", "2015-11-11"],
    warnings: ["Flat placeholder period before 2013", "Duplicate sessions in 2015"],
  },
  { index: "MIDCPNIFTY", rawFirstSession: "2022-01-10", usableFrom: "2022-01-10", flatPlaceholderYears: "", duplicateSessions: [], warnings: ["Series starts 2022; no earlier history stored"] },
  { index: "SENSEX", rawFirstSession: "2000-01-03", usableFrom: "2000-01-03", flatPlaceholderYears: "", duplicateSessions: [], warnings: ["BSE session calendar not stored; calendar alignment unverified"] },
  {
    index: "BANKEX", rawFirstSession: "2002-01-01", usableFrom: "2004-01-01",
    flatPlaceholderYears: "2002 (all bars flat); 2003 partly (118 of 254)",
    duplicateSessions: ["2015-11-09"],
    warnings: ["Flat placeholder period before 2004", "Duplicate session in 2015", "BSE session calendar not stored; calendar alignment unverified"],
  },
];

export function indexHistoryQuality(index: string): IndexHistoryQuality | undefined {
  return INDEX_HISTORY_QUALITY.find((q) => q.index === index.toUpperCase());
}
