# Verifies an NSE F&O bhavcopy collection and writes a coverage report to a NEW directory.
# Reads ZIPs and manifest only; never modifies the collection directory.
# Usage: python3 nse-bhavcopy-verify.py --collection <dir> --dates <file> --out <NEW_DIR>
import os, sys, json, csv, io, zipfile, hashlib, argparse, collections, datetime as dt

REQ = ["TradDt","BizDt","FinInstrmTp","FinInstrmId","TckrSymb","XpryDt","StrkPric","OptnTp",
       "OpnPric","HghPric","LwPric","ClsPric","SttlmPric","OpnIntrst","TtlTradgVol"]
# Fields NSE does not provide in this file: bid/ask, implied volatility, Greeks.
ABSENT = ["BidPric","AskPric","BidQty","AskQty","ImpliedVolatility","Delta","Gamma","Theta","Vega"]

def fnum(x):
    try: return float(x)
    except (TypeError, ValueError): return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--collection", required=True)
    ap.add_argument("--dates", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=False)            # refuses to write into an existing directory
    expected = [l.strip() for l in open(a.dates) if l.strip()]
    recs = {}
    for l in open(os.path.join(a.collection, "manifest.jsonl")):
        r = json.loads(l)
        if r.get("kind") == "day": recs[r["day"]] = r          # last record per day wins
    state_count = collections.Counter(recs[d]["state"] for d in expected if d in recs)
    not_logged = [d for d in expected if d not in recs]

    stored, schema_issues, bad_zip = [], [], []
    by_year = collections.Counter(); by_type = collections.Counter()
    syms, strikes, expiries = set(), set(), set()
    idx_opt = stk_opt = other = 0
    vol_ok = oi_ok = 0; total = 0
    dup = 0; seen = set(); bad_ohlc = 0; neg = 0; no_trade = 0
    hashes = []
    header_sets = collections.Counter()
    absent_found = collections.Counter()
    for d in expected:
        r = recs.get(d)
        if not r or r["state"] != "STORED": continue
        z = os.path.join(a.collection, "zips", f"{d}.zip")
        raw = open(z, "rb").read()
        hashes.append({"file": f"zips/{d}.zip", "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()})
        try:
            zf = zipfile.ZipFile(io.BytesIO(raw))
            if zf.testzip() is not None: bad_zip.append(d); continue
            names = [n for n in zf.namelist() if n.lower().endswith(".csv")]
            if len(names) != 1: schema_issues.append((d, f"csv members={len(names)}")); continue
            text = zf.read(names[0]).decode("utf-8", errors="replace")
        except zipfile.BadZipFile:
            bad_zip.append(d); continue
        rd = csv.DictReader(io.StringIO(text))
        cols = rd.fieldnames or []
        header_sets[tuple(cols)] += 1
        missing = [c for c in REQ if c not in cols]
        if missing: schema_issues.append((d, f"missing {missing}")); continue
        for c in ABSENT:
            if c in cols: absent_found[c] += 1
        stored.append(d)
        for row in rd:
            total += 1
            by_year[d[:4]] += 1
            t = row["FinInstrmTp"]; by_type[t] += 1
            if t in ("IDO",): idx_opt += 1
            elif t in ("STO",): stk_opt += 1
            else: other += 1
            syms.add(row["TckrSymb"]); strikes.add((row["TckrSymb"], row["StrkPric"])); expiries.add(row["XpryDt"])
            key = (row["TradDt"], t, row["TckrSymb"], row["XpryDt"], row["StrkPric"], row["OptnTp"])
            if key in seen: dup += 1
            seen.add(key)
            o, h, l, c = fnum(row["OpnPric"]), fnum(row["HghPric"]), fnum(row["LwPric"]), fnum(row["ClsPric"])
            if None not in (o, h, l, c):
                if o == 0 and h == 0 and l == 0 and c > 0:
                    no_trade += 1          # no trade that day: only the settlement/close price is published
                elif h < max(o, c, l) or l > min(o, c, h): bad_ohlc += 1
                if min(o, h, l, c) < 0: neg += 1
            if fnum(row["TtlTradgVol"]) is not None: vol_ok += 1
            if fnum(row["OpnIntrst"]) is not None: oi_ok += 1

    manifest_sha = hashlib.sha256(open(os.path.join(a.collection, "manifest.jsonl"), "rb").read()).hexdigest()
    report = {
        "generated_utc": dt.datetime.utcnow().isoformat(),
        "collection": a.collection,
        "expected_trading_dates": len(expected),
        "logged_dates": len(recs) and sum(1 for d in expected if d in recs),
        "not_logged": not_logged,
        "states": dict(state_count),
        "stored_and_verified": len(stored),
        "bad_zip": bad_zip,
        "schema_issues": schema_issues,
        "header_variants": len(header_sets),
        "contract_rows": total,
        "rows_by_year": dict(sorted(by_year.items())),
        "rows_by_instrument_type": dict(by_type),
        "index_option_rows": idx_opt,
        "stock_option_rows": stk_opt,
        "other_rows": other,
        "unique_symbols": len(syms),
        "unique_symbol_strike_pairs": len(strikes),
        "unique_expiries": len(expiries),
        "rows_with_volume": vol_ok,
        "rows_with_open_interest": oi_ok,
        "duplicate_contract_rows": dup,
        "invalid_ohlc_rows": bad_ohlc,
        "no_trade_placeholder_rows": no_trade,
        "negative_price_rows": neg,
        "absent_fields_present": dict(absent_found),
        "absent_fields_expected": ABSENT,
        "zip_bytes_total": sum(h["bytes"] for h in hashes),
        "manifest_sha256": manifest_sha,
        "files": hashes,
    }
    json.dump(report, open(os.path.join(a.out, "coverage.json"), "w"), indent=2)
    with open(os.path.join(a.out, "SHA256SUMS.txt"), "w") as f:
        f.write(f"{manifest_sha}  manifest.jsonl (source: {a.collection})\n")
        for h in hashes: f.write(f"{h['sha256']}  {h['file']}\n")
    print(json.dumps({k: v for k, v in report.items() if k != "files"}, indent=1)[:3000])

if __name__ == "__main__":
    main()
