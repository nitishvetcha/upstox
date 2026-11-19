# Development-period runner for the five pre-registered daily cross-sectional protocols (docs/protocols/).
# DEVELOPMENT ONLY: 2010-01-04 to 2017-12-31. Validation and holdout data are never used: every trade must exit on or
# before 2017-12-31. Output: a new directory, written once. Costs are PROVISIONAL sensitivity scenarios (see protocols).
import json, csv, re, math, datetime as dt, os, sys
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
V = os.path.join(ROOT, ".research-data", "upstox-daily-universe-verified-2026-11-08")
V1 = os.path.join(ROOT, ".research-data", "upstox-verified-2026-11-08-v1")
OUT = os.path.join(ROOT, ".research-data", "crosssectional-dev-2026-11-08")
SEED = 20261108
DRAWS = 1000
DEV_START, DEV_END = "2010-01-04", "2017-12-31"
FLAG = 0.35
SCEN = {  # slippage per side; identical fixed charges; GST base differs (provisional)
    "LOW": {"slip": 0.0010, "gst_base": "brokerage+exchange"},
    "HIGH": {"slip": 0.0025, "gst_base": "brokerage+exchange+SEBI+DP+IPFT"},
}
EXCH = 306.99 / 1e7   # NSE circular NSE/FA/73061 (confirmed, effective 1 Mar 2026; applied to ALL dates: see historical limitation)
IPFT = 0.01 / 1e7     # confirmed, same circular
SEBI = 10 / 1e7       # UNRESOLVED (primary not retrieved); used as provisional value
STT = 0.001           # UNRESOLVED (primary not retrieved); delivery both sides, provisional
STAMP = 0.00015       # UNRESOLVED (state-specific); buy side, provisional
BROK = 20.0           # owner decision: Rs 20 per executed order
DP = 20.0             # Upstox customer-facing DP charge (confirmed, broker official); per sell per scrip
GST = 0.18            # UNRESOLVED calculation base; rate 18% per secondary sources; base per scenario
NOTIONAL = 100000.0   # documented assumption for converting fixed charges to % (equal-weight position size)
LIQ = {"primary": 1e7, "sens_50L": 5e6, "sens_2Cr": 2e7}

# ---------- load verified data ----------
cal = json.load(open(f"{V}/calendar.json"))["sessions"]
N = len(cal); cidx = {d: i for i, d in enumerate(cal)}
import bisect
DEV_START_I = bisect.bisect_left(cal, DEV_START)
DEV_END_I = bisect.bisect_right(cal, DEV_END) - 1  # last session on or before DEV_END
cov = json.load(open(f"{V}/coverage.json"))["series"]
S = len(cov)
keys = [c["key"] for c in cov]; syms = [c["symbol"] for c in cov]
master = {}
for r in csv.DictReader(open(os.path.join(ROOT, ".research-data", "nse-equity-master-2026-11-08", "EQUITY_L.csv"), encoding="utf-8-sig")):
    r = {k.strip(): (v or "").strip() for k, v in r.items()}
    master[r["ISIN NUMBER"]] = dt.date.fromisoformat(dt.datetime.strptime(r["DATE OF LISTING"], "%d-%b-%Y").date().isoformat())
O = np.full((N, S), np.nan); C = np.full((N, S), np.nan); VOL = np.full((N, S), np.nan)
listing = np.full(S, None, dtype=object)
fn = lambda k: re.sub(r"[^A-Za-z0-9]+", "_", k) + "__1d.json"
for j, k in enumerate(keys):
    bars = json.load(open(f"{V}/series/{fn(k)}"))["bars"]
    for b in bars:
        d = b[0][:10]
        if d in cidx:
            i = cidx[d]; O[i, j] = b[1]; C[i, j] = b[4]; VOL[i, j] = b[5]
    isin = k.split("|")[1]
    listing[j] = master.get(isin)

# corporate-action ex-dates (split, bonus, face-value events) per stock
events = json.load(open(os.path.join(ROOT, ".research-data", "corporate-actions-verified-2026-11-08", "corporate-actions-validation-all-years.json")))["tests"]
exdates = {}
for e in events:
    d = e["exDate"]
    try:
        iso = dt.datetime.strptime(d, "%d-%b-%Y").date().isoformat()
    except Exception:
        continue
    exdates.setdefault(e["isin"], set()).add(iso)

# exclusions: pre-listing bars, 35% flagged opens, corporate ex-date sessions
EXC = np.zeros((N, S), dtype=bool)
for j in range(S):
    lst = listing[j]
    for i in range(N):
        if lst is not None and cal[i] < lst.isoformat():
            EXC[i, j] = True
    isin = keys[j].split("|")[1]
    for d in exdates.get(isin, ()):
        if d in cidx: EXC[cidx[d], j] = True
prevC = np.vstack([np.full((1, S), np.nan), C[:-1]])
with np.errstate(invalid="ignore"):
    flagged = np.abs(O / prevC - 1) > FLAG
EXC |= np.nan_to_num(flagged, nan=False).astype(bool)
VALID = (~np.isnan(C)) & (VOL > 0) & (~EXC)
CV = np.vstack([np.zeros((1, S), dtype=int), np.cumsum(VALID, axis=0)])
VALUE = np.where(VALID, C * VOL, np.nan)

def eligible(t, thr):
    cnt252 = CV[t + 1] - CV[max(t + 1 - 252, 0)]
    win = VALUE[max(t - 59, 0):t + 1]
    med = np.full(S, np.nan)
    ok = (~np.all(np.isnan(win), axis=0))
    with np.errstate(all="ignore"):
        med[ok] = np.nanmedian(win[:, ok], axis=0)
    c60 = VALID[max(t - 59, 0):t + 1].sum(axis=0)
    return (cnt252 >= 240) & (c60 >= 45) & (med >= thr), med

def exec_price(j, day, side):
    """Open price on day for stock j; if no valid bar, roll forward up to 5 sessions. Returns (price, day_used) or (None, None)."""
    for d in range(day, min(day + 6, N)):
        if VALID[d, j]:
            return O[d, j], d
    return None, None

def last_price(j, day):
    for d in range(min(day, N - 1), -1, -1):
        if VALID[d, j]:
            return C[d, j], d
    return None, None

def cost_frac(scen):
    """Provisional round-trip cost as a fraction of entry notional. Charges are PROVISIONAL (see protocols).
    Confirmed: exchange and IPFT (NSE circular); Upstox DP Rs 20 + GST per sell. Unresolved: SEBI, STT, stamp, GST base."""
    buy_pct = EXCH + IPFT + SEBI + STT + STAMP
    sell_pct = EXCH + IPFT + SEBI + STT
    brok = 2 * BROK                       # Rs 20 per executed order, two orders
    dp = DP                               # one DP charge per scrip per sell day
    base = brok + EXCH * NOTIONAL * 2     # LOW: GST on brokerage and exchange charges only
    if scen == "HIGH":                    # HIGH: GST also on SEBI, IPFT and DP (unverified base)
        base += SEBI * NOTIONAL * 2 + IPFT * NOTIONAL * 2 + dp
    gst_total = GST * base + GST * dp     # GST on DP charge is part of Upstox's Rs 20 + GST
    fixed_inr = brok + dp + gst_total
    return buy_pct + sell_pct + fixed_inr / NOTIONAL, fixed_inr

# ---------- strategy engine (H1 and H2: long-only decile portfolios) ----------
def run_decile(name, lookback, skip, hold, rank_sign, thr, scen):
    """rank_sign=+1 long top decile (H1); -1 long bottom decile (H2)."""
    slip = SCEN[scen]["slip"]
    cf, _ = cost_frac(scen)
    reb = []
    skipped_dates = 0; skipped_names = 0; forced = 0; truncated = 0
    t0 = DEV_START_I; t1 = DEV_END_I
    t = t0
    while t <= t1 - (hold + 1):
        E, _ = eligible(t, thr)
        idx = np.where(E)[0]
        if len(idx) < 100:
            skipped_dates += 1; t += hold; continue
        if skip is None:
            ret = np.array([C[t, j] / C[t - lookback, j] - 1 if (t - lookback >= 0 and VALID[t, j] and VALID[t - lookback, j]) else np.nan for j in idx])
        else:
            ret = np.array([C[t - skip, j] / C[t - lookback, j] - 1 if (t - lookback >= 0 and VALID[t - skip, j] and VALID[t - lookback, j]) else np.nan for j in idx])
        good = ~np.isnan(ret)
        idx2, ret2 = idx[good], ret[good]
        if len(idx2) < 100:
            skipped_dates += 1; t += hold; continue
        n = max(10, math.ceil(len(idx2) / 10))
        order = np.argsort(-rank_sign * ret2)
        port = idx2[order[:n]]
        ent_day = t + 1; ex_day = t + 1 + hold
        if ex_day > t1:  # would extend beyond development end (must not touch later data)
            truncated += 1; t += hold; continue
        def trade_return(j):
            ep, ed = exec_price(j, ent_day, "buy")
            if ep is None: return None
            xp, xd = exec_price(j, ex_day, "sell")
            if xp is None:
                xp, xd = last_price(j, min(ex_day, t1))
                if xp is None: return None
                nonlocal_forced[0] += 1
            return (xp * (1 - slip)) / (ep * (1 + slip)) - 1.0
        nonlocal_forced = [0]
        port_rets = []; port_gross = []
        for j in port:
            r = trade_return(j)
            if r is None: skipped_names += 1; continue
            port_gross.append(r); port_rets.append(r - cf)
        allr = []
        for j in idx2:
            r = trade_return(j)
            if r is not None: allr.append(r - cf)
        forced += nonlocal_forced[0]
        if len(port_rets) < max(5, n // 2) or len(allr) < 50:
            skipped_dates += 1; t += hold; continue
        # null: random same-size portfolios from the eligible set (same execution rules), DRAWS draws
        rng = np.random.default_rng(SEED + t)
        pool_r = np.array([trade_return(j) for j in idx2 if trade_return(j) is not None]) - cf
        draws = np.array([np.mean(rng.choice(pool_r, size=len(port_rets), replace=False)) for _ in range(DRAWS)]) if len(pool_r) >= len(port_rets) else np.array([np.nan])
        reb.append({"date": cal[t], "eligible": int(len(idx2)), "n": n, "portNet": float(np.mean(port_rets)), "portGross": float(np.mean(port_gross)),
                    "eligNet": float(np.mean(allr)), "spreadNet": float(np.mean(port_rets) - np.mean(allr)),
                    "nullMean": float(np.nanmean(draws)), "nullSpreadPct": float(np.mean(draws < np.mean(port_rets)) * 100) if not np.isnan(draws).all() else None,
                    "entryDay": cal[ent_day], "exitDay": cal[ex_day]})
        t += hold
    return {"hypothesis": name, "scenario": scen, "rebalances": reb, "skippedDates": skipped_dates, "skippedNames": skipped_names, "forcedExits": forced, "truncatedAtDevEnd": truncated}

# ---------- H3/H4/H5 predictive comparisons (gross, daily, 21-session forward open-to-open) ----------
def fwd21(t):
    if t + 22 > N - 1: return None
    f = np.full(S, np.nan)
    for j in range(S):
        if VALID[t + 1, j] and VALID[t + 22, j]:
            f[j] = O[t + 22, j] / O[t + 1, j] - 1
    return f

NIFTY = np.full(N, np.nan)
nf = json.load(open(f"{V1}/series/NSE_INDEX_Nifty_50__1d.json"))["bars"]
for b in nf:
    d = b[0][:10]
    if d in cidx: NIFTY[cidx[d]] = b[4]
r_nifty = np.full(N, np.nan)
r_nifty[1:] = np.log(NIFTY[1:] / NIFTY[:-1])
RV = np.full(N, np.nan)      # RV[t]: annualised std of the 20 log returns ending at session t-1 (prior data only)
for t in range(21, N):
    w = r_nifty[t - 20:t]
    if not np.isnan(w).any(): RV[t] = np.std(w, ddof=1) * math.sqrt(252)

def predictive(thr):
    t0 = DEV_START_I; t1 = DEV_END_I - 22
    out = {"H3_breadth": {"HIGH": [], "LOW": []}, "H4_volatility": {"HIGH": [], "LOW": []}, "H5_liquidity": {"Q5_minus_Q1": []}}
    for t in range(t0, t1 + 1):
        E, med = eligible(t, thr)
        idx = np.where(E)[0]
        if len(idx) < 100: continue
        f = fwd21(t)
        if f is None: continue
        fe = f[idx]; fe = fe[~np.isnan(fe)]
        if len(fe) < 50: continue
        # H3 breadth: share of eligible above 50-session mean of valid closes
        br = []
        for j in idx:
            w = C[max(t - 49, 0):t + 1, j]; v = VALID[max(t - 49, 0):t + 1, j]
            if v.sum() >= 40 and VALID[t, j]:
                br.append(C[t, j] > np.nanmean(w[v]))
        if len(br) >= 50:
            regime = "HIGH" if np.mean(br) >= 0.5 else "LOW"
            out["H3_breadth"][regime].append(float(np.mean(fe)))
        # H4 volatility regime: RV at previous session vs trailing 252-session median of RV (prior data only)
        if not np.isnan(RV[t]) and t - 252 >= 0:
            past = RV[t - 252:t]; past = past[~np.isnan(past)]
            if len(past) >= 150:
                reg = "HIGH" if RV[t] > np.median(past) else "LOW"
                out["H4_volatility"][reg].append(float(np.mean(fe)))
        # H5 liquidity quintiles (60-session median value at t), Q5 minus Q1 of forward returns
        vals = med[idx]; fj = f[idx]; okk = ~np.isnan(fj) & ~np.isnan(vals)
        if okk.sum() >= 100:
            order = np.argsort(vals[okk]); fv = fj[okk][order]
            q = len(fv) // 5
            out["H5_liquidity"]["Q5_minus_Q1"].append(float(np.mean(fv[-q:]) - np.mean(fv[:q])))
    summ = {}
    for h, d in out.items():
        summ[h] = {k: {"n": len(v), "mean": (float(np.mean(v)) if v else None)} for k, v in d.items()}
    return summ

# ---------- run ----------
if os.path.exists(OUT):
    raise SystemExit(f"{OUT} exists; development runs are written once")
os.makedirs(OUT)
results = {"scope": "DEVELOPMENT ONLY 2010-01-04..2017-12-31; validation and holdout not used", "seed": SEED, "draws": DRAWS,
           "costs": "PROVISIONAL sensitivity (see protocols); exchange/IPFT = confirmed NSE circular; others UNRESOLVED", "runs": {}}
for lab, thr in LIQ.items():
    for scen in ["LOW", "HIGH"]:
        results["runs"][f"H1_{lab}_{scen}"] = run_decile("H1_RELATIVE_STRENGTH_12M_SKIP1M", 252, 21, 21, +1, thr, scen)
        results["runs"][f"H2_{lab}_{scen}"] = run_decile("H2_SHORT_REVERSAL_1M", 21, None, 5, -1, thr, scen)
    results["runs"][f"H3H4H5_{lab}"] = predictive(thr)
results["eligibleByYear"] = {}
for y in range(2010, 2018):
    t = bisect.bisect_right(cal, f"{y}-06-30") - 1
    E, _ = eligible(t, LIQ["primary"])
    results["eligibleByYear"][str(y)] = int(E.sum())
json.dump(results, open(f"{OUT}/development-results.json", "w"), indent=1, default=str)
print("written", os.path.relpath(OUT, ROOT))
