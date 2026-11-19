# Development runner with amendment A2 (docs/protocols/AMENDMENT_A2_PRICE_ARTEFACT_v1.0.md).
# usage: python3 scripts/crosssectional-daily-a2.py <before|after>
#   before: A2 OFF, logs flagged windows only. Must reproduce v1.0 results (sanity check).
#   after:  A2 ON, excludes flagged observations and windows crossing them.
# DEVELOPMENT ONLY 2010-01-04..2017-12-31. Validation/holdout never used. Writes a new directory once.
import json, csv, re, math, datetime as dt, os, sys, bisect
import numpy as np

MODE = sys.argv[1] if len(sys.argv) > 1 else "after"
assert MODE in ("before", "after")
A2 = MODE == "after"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
V = os.path.join(ROOT, ".research-data", "upstox-daily-universe-verified-2026-11-08")
V1 = os.path.join(ROOT, ".research-data", "upstox-verified-2026-11-08-v1")
OUT = os.path.join(ROOT, ".research-data", f"crosssectional-dev-A2-{MODE}-2026-11-08")
SEED = 20261108; DRAWS = 1000
DEV_START, DEV_END = "2010-01-04", "2017-12-31"
FLAG = 0.35          # v1.0 open-vs-previous-close exclusion (kept)
A2_THR = 0.20        # A2 close-to-close threshold
SCEN = {"LOW": {"slip": 0.0010}, "HIGH": {"slip": 0.0025}}
EXCH = 306.99 / 1e7; IPFT = 0.01 / 1e7; SEBI = 10 / 1e7; STT = 0.001; STAMP = 0.00015
BROK = 20.0; DP = 20.0; GST = 0.18; NOTIONAL = 100000.0
LIQ = {"primary": 1e7, "sens_50L": 5e6, "sens_2Cr": 2e7}

cal = json.load(open(f"{V}/calendar.json"))["sessions"]; N = len(cal)
cidx = {d: i for i, d in enumerate(cal)}
DEV_START_I = bisect.bisect_left(cal, DEV_START); DEV_END_I = bisect.bisect_right(cal, DEV_END) - 1
cov = json.load(open(f"{V}/coverage.json"))["series"]; S = len(cov)
keys = [c["key"] for c in cov]; syms = [c["symbol"] for c in cov]
master = {}
for r in csv.DictReader(open(os.path.join(ROOT, ".research-data", "nse-equity-master-2026-11-08", "EQUITY_L.csv"), encoding="utf-8-sig")):
    r = {k.strip(): (v or "").strip() for k, v in r.items()}
    master[r["ISIN NUMBER"]] = dt.datetime.strptime(r["DATE OF LISTING"], "%d-%b-%Y").date()
O = np.full((N, S), np.nan); C = np.full((N, S), np.nan); VOL = np.full((N, S), np.nan)
listing = [None] * S
fn = lambda k: re.sub(r"[^A-Za-z0-9]+", "_", k) + "__1d.json"
for j, k in enumerate(keys):
    for b in json.load(open(f"{V}/series/{fn(k)}"))["bars"]:
        d = b[0][:10]
        if d in cidx:
            i = cidx[d]; O[i, j] = b[1]; C[i, j] = b[4]; VOL[i, j] = b[5]
    listing[j] = master.get(k.split("|")[1])
events = json.load(open(os.path.join(ROOT, ".research-data", "corporate-actions-verified-2026-11-08", "corporate-actions-validation-all-years.json")))["tests"]
exdates = {}
for e in events:
    try: exdates.setdefault(e["isin"], set()).add(dt.datetime.strptime(e["exDate"], "%d-%b-%Y").date().isoformat())
    except Exception: pass

EXC = np.zeros((N, S), dtype=bool)
for j in range(S):
    if listing[j] is not None:
        for i in range(N):
            if cal[i] < listing[j].isoformat(): EXC[i, j] = True
    for d in exdates.get(keys[j].split("|")[1], ()):
        if d in cidx: EXC[cidx[d], j] = True
prevC = np.vstack([np.full((1, S), np.nan), C[:-1]])
with np.errstate(invalid="ignore"):
    EXC |= np.nan_to_num(np.abs(O / prevC - 1) > FLAG, nan=False).astype(bool)
    # A2 flag: absolute close-to-close move > 20% vs previous session close
    FLG = np.nan_to_num(np.abs(C / prevC - 1) > A2_THR, nan=False).astype(bool)
# NIFTY index flags (for H4 under A2)
NIFTY = np.full(N, np.nan)
for b in json.load(open(f"{V1}/series/NSE_INDEX_Nifty_50__1d.json"))["bars"]:
    d = b[0][:10]
    if d in cidx: NIFTY[cidx[d]] = b[4]
nflg = np.zeros(N, dtype=bool)
with np.errstate(invalid="ignore"):
    nflg[1:] = np.abs(NIFTY[1:] / NIFTY[:-1] - 1) > A2_THR
if A2:
    EXC |= FLG
VALID = (~np.isnan(C)) & (VOL > 0) & (~EXC)
CV = np.vstack([np.zeros((1, S), dtype=int), np.cumsum(VALID, axis=0)])
VALUE = np.where(VALID, C * VOL, np.nan)
EXC_LOG = {"flaggedStockDays": int(FLG.sum()), "flaggedStocks": int(FLG.any(axis=0).sum()), "flaggedDates": int(FLG.any(axis=1).sum()),
           "flaggedIndexDays": int(nflg.sum())}

def window_flag(j, a, b):
    """True if any A2-flagged observation of stock j lies in [a, b] inclusive (scheduled days)."""
    a = max(a, 0); b = min(b, N - 1)
    return bool(FLG[a:b + 1, j].any())

def eligible(t, thr):
    cnt252 = CV[t + 1] - CV[max(t + 1 - 252, 0)]
    win = VALUE[max(t - 59, 0):t + 1]
    med = np.full(S, np.nan)
    ok = ~np.all(np.isnan(win), axis=0)
    with np.errstate(all="ignore"):
        med[ok] = np.nanmedian(win[:, ok], axis=0)
    c60 = VALID[max(t - 59, 0):t + 1].sum(axis=0)
    return (cnt252 >= 240) & (c60 >= 45) & (med >= thr), med

def fixed_cost(scen):
    buy_pct = EXCH + IPFT + SEBI + STT + STAMP
    sell_pct = EXCH + IPFT + SEBI + STT
    brok = 2 * BROK; dp = DP
    base = brok + EXCH * NOTIONAL * 2
    if scen == "HIGH": base += SEBI * NOTIONAL * 2 + IPFT * NOTIONAL * 2 + dp
    fixed_inr = brok + dp + GST * base + GST * dp
    return buy_pct + sell_pct + fixed_inr / NOTIONAL

LOG = {"positions": [], "excludedWindows": [], "skippedSignals": []}

def exec_price(j, day):
    for d in range(day, min(day + 6, N)):
        if VALID[d, j]: return O[d, j], d
    return None, None

def last_price(j, day):
    for d in range(min(day, N - 1), -1, -1):
        if VALID[d, j]: return C[d, j], d
    return None, None

def run_decile(name, lookback, skip, hold, sign, thr, scen, tag):
    slip = SCEN[scen]["slip"]; cf = fixed_cost(scen)
    reb = []; skipped_dates = 0; skipped_names = 0; forced = 0; truncated = 0
    t = DEV_START_I; t1 = DEV_END_I
    while t <= t1 - (hold + 1):
        E, _ = eligible(t, thr); idx = np.where(E)[0]
        if len(idx) < 100:
            skipped_dates += 1; t += hold; continue
        ent_day = t + 1; ex_day = t + 1 + hold
        if ex_day > t1:
            truncated += 1; t += hold; continue
        rets = []
        for j in idx:
            a = t - lookback; bnd = t - (skip or 0)
            if a < 0 or not VALID[bnd, j] or not VALID[a, j]:
                continue
            if A2 and window_flag(j, a + 1, bnd):
                LOG["excludedWindows"].append({"hyp": name, "date": cal[t], "stock": syms[j], "reason": "signal lookback crosses A2 flag"})
                continue
            rets.append((j, C[bnd, j] / C[a, j] - 1))
        if len(rets) < 100:
            skipped_dates += 1; t += hold; continue
        jj = np.array([r[0] for r in rets]); rr = np.array([r[1] for r in rets])
        n = max(10, math.ceil(len(jj) / 10))
        order = np.argsort(-sign * rr)
        port = set(jj[order[:n]].tolist())
        nonlocal_forced = [0]
        def trade_return(j, flagged_log_only=False):
            if not flagged_log_only and A2 and window_flag(j, ent_day, ex_day):
                LOG["excludedWindows"].append({"hyp": name, "date": cal[t], "stock": syms[j], "reason": "holding window crosses A2 flag"})
                return None
            ep, ed = exec_price(j, ent_day)
            if ep is None: return None
            xp, xd = exec_price(j, ex_day)
            if xp is None:
                xp, xd = last_price(j, min(ex_day, t1))
                if xp is None: return None
                nonlocal_forced[0] += 1
            return (xp * (1 - slip)) / (ep * (1 + slip)) - 1.0
        port_net = []; port_gross = []; pos_rows = []
        for j in port:
            r = trade_return(j)
            flg = window_flag(j, ent_day, ex_day) or window_flag(j, t - lookback + 1, t - (skip or 0))
            if r is None:
                skipped_names += 1; continue
            port_net.append(r - cf); port_gross.append(r)
            pos_rows.append({"stock": syms[j], "signal": cal[t], "entry": cal[ent_day], "exit": cal[ex_day], "gross": r, "net": r - cf, "windowHasFlag": bool(flg)})
        allr = []
        for j in jj:
            r = trade_return(j, flagged_log_only=True)
            if r is not None: allr.append(r - cf)
        forced += nonlocal_forced[0]
        if len(port_net) < max(5, n // 2) or len(allr) < 50:
            skipped_dates += 1; t += hold; continue
        LOG["positions"].extend([{**p, "hyp": tag} for p in pos_rows])
        rng = np.random.default_rng(SEED + t)
        pool = np.array(allr)
        draws = np.array([np.mean(rng.choice(pool, size=len(port_net), replace=False)) for _ in range(DRAWS)]) if len(pool) >= len(port_net) else np.array([np.nan])
        reb.append({"date": cal[t], "eligible": int(len(jj)), "n": n, "portNet": float(np.mean(port_net)), "portGross": float(np.mean(port_gross)),
                    "eligNet": float(np.mean(allr)), "spreadNet": float(np.mean(port_net) - np.mean(allr)),
                    "nullSpreadPct": float(np.mean(draws < np.mean(port_net)) * 100)})
        t += hold
    return {"hypothesis": name, "scenario": scen, "rebalances": reb, "skippedDates": skipped_dates, "skippedNames": skipped_names, "forcedExits": forced, "truncatedAtDevEnd": truncated}

def predictive(thr):
    out = {"H3_breadth": {"HIGH": [], "LOW": []}, "H4_volatility": {"HIGH": [], "LOW": []}, "H5_liquidity": {"Q5_minus_Q1": []}}
    RV = np.full(N, np.nan)
    rlog = np.full(N, np.nan); rlog[1:] = np.log(NIFTY[1:] / NIFTY[:-1])
    for t in range(21, N):
        w = rlog[t - 20:t]
        if not np.isnan(w).any() and not (A2 and nflg[t - 20:t].any()):
            RV[t] = np.std(w, ddof=1) * math.sqrt(252)
    for t in range(DEV_START_I, DEV_END_I - 21):
        E, med = eligible(t, thr); idx = np.where(E)[0]
        if len(idx) < 100: continue
        f = np.full(S, np.nan)
        for j in range(S):
            if VALID[t + 1, j] and VALID[t + 22, j] and not (A2 and window_flag(j, t + 1, t + 22)):
                f[j] = O[t + 22, j] / O[t + 1, j] - 1
        fe = f[idx]; fe = fe[~np.isnan(fe)]
        if len(fe) < 50: continue
        br = []
        for j in idx:
            w = C[max(t - 49, 0):t + 1, j]; v = VALID[max(t - 49, 0):t + 1, j]
            if v.sum() >= 40 and VALID[t, j]: br.append(C[t, j] > np.nanmean(w[v]))
        if len(br) >= 50:
            out["H3_breadth"]["HIGH" if np.mean(br) >= 0.5 else "LOW"].append(float(np.mean(fe)))
        if not np.isnan(RV[t]) and t - 252 >= 0:
            past = RV[t - 252:t]; past = past[~np.isnan(past)]
            if len(past) >= 150:
                out["H4_volatility"]["HIGH" if RV[t] > np.median(past) else "LOW"].append(float(np.mean(fe)))
        vals = med[idx]; fj = f[idx]; okk = ~np.isnan(fj) & ~np.isnan(vals)
        if okk.sum() >= 100:
            order = np.argsort(vals[okk]); fv = fj[okk][order]; q = len(fv) // 5
            out["H5_liquidity"]["Q5_minus_Q1"].append(float(np.mean(fv[-q:]) - np.mean(fv[:q])))
    return {h: {k: {"n": len(v), "mean": (float(np.mean(v)) if v else None)} for k, v in d.items()} for h, d in out.items()}

if os.path.exists(OUT):
    raise SystemExit(f"{OUT} exists; written once")
os.makedirs(OUT)
res = {"mode": MODE, "a2Applied": A2, "scope": "DEVELOPMENT ONLY 2010-01-04..2017-12-31; sensitivity/research rerun after A2 (not validation)" if A2 else "BEFORE mode: reproduces v1.0 (contaminated)", "seed": SEED, "draws": DRAWS, "exclusionCounts": EXC_LOG, "runs": {}}
for lab, thr in LIQ.items():
    for scen in ["LOW", "HIGH"]:
        res["runs"][f"H1_{lab}_{scen}"] = run_decile("H1_RELATIVE_STRENGTH_12M_SKIP1M", 252, 21, 21, +1, thr, scen, f"H1_{lab}_{scen}")
        res["runs"][f"H2_{lab}_{scen}"] = run_decile("H2_SHORT_REVERSAL_1M", 21, None, 5, -1, thr, scen, f"H2_{lab}_{scen}")
    res["runs"][f"H3H4H5_{lab}"] = predictive(thr)
json.dump(res, open(f"{OUT}/results.json", "w"), indent=1, default=str)
json.dump(LOG, open(f"{OUT}/positions-and-exclusions.json", "w"), indent=0, default=str)
print("written", os.path.relpath(OUT, ROOT), "| flagged stock-days:", EXC_LOG["flaggedStockDays"], "| stocks:", EXC_LOG["flaggedStocks"])
