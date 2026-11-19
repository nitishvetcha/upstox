import os as _guard_os, sys as _guard_sys
if _guard_os.environ.get("EXTERNAL_COLLECTION_ENABLED") != "true":
    _guard_sys.stderr.write("[COLLECTION BLOCKED] nse-bhavcopy-sweep.py: requires EXTERNAL_COLLECTION_ENABLED=true. No network request was sent.\n")
    _guard_sys.exit(2)

# Free NSE F&O bhavcopy sweep, 2010-01-01 to 2026-11-05 (approved). Resumable. Writes a NEW dated directory only.
# 403/404 for a URL = that archive not available (recorded). 5xx/network = retried with backoff, not counted as missing.
# 429 or repeated access failure = stop. Zip signature checked. Every request logged with URL, status, size, sha256.
import os, json, time, hashlib, datetime as dt, bisect, urllib.request, urllib.error, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, ".research-data", "nse-bhavcopy-sweep-2010-2026-2026-11-08")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
MON = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"]
NEW_FROM = "2024-07-08"
THROTTLE = 1.5
FLOOR = 2 * 1024**3
cal = json.load(open(os.path.join(ROOT, ".research-data/upstox-daily-universe-verified-2026-11-08/calendar.json")))["sessions"]
days = [d for d in cal if "2010-01-01" <= d <= "2026-11-05"]
def urls(day):
    y, m, d = day.split("-")
    old = f"https://archives.nseindia.com/content/historical/DERIVATIVES/{y}/{MON[int(m)-1]}/fo{d}{MON[int(m)-1]}{y}bhav.csv.zip"
    new = f"https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_{y}{m}{d}_F_0000.csv.zip"
    return [new, old] if day >= NEW_FROM else [old, new]
os.makedirs(os.path.join(OUT, "zips"), exist_ok=True)
MAN = os.path.join(OUT, "manifest.jsonl")
done = set(); conc_unavail = set()
if os.path.exists(MAN):
    for l in open(MAN):
        r = json.loads(l)
        if r.get("kind") == "day" and r.get("state") in ("STORED", "UNAVAILABLE"): done.add(r["day"])
def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, b""
    except Exception as e:
        return 0, str(e).encode()
def log(row):
    with open(MAN, "a") as f: f.write(json.dumps(row) + "\n")
def free():
    s = os.statvfs(OUT); return s.f_bavail * s.f_frsize
consec_bad = 0
for day in days:
    if day in done: continue
    if free() < FLOOR:
        log({"kind": "stop", "reason": "disk floor", "at": dt.datetime.utcnow().isoformat()}); print("stop disk"); break
    outcome = []; state = None
    for u in urls(day):
        status, body = None, None
        for attempt, wait in enumerate([0, 10, 30]):
            if wait: time.sleep(wait)
            status, body = get(u)
            time.sleep(THROTTLE)
            if status in (0, 500, 502, 503, 504): continue
            break
        ok = status == 200 and body[:2] == b"PK" and len(body) > 1000
        sha = hashlib.sha256(body).hexdigest() if status == 200 else None
        log({"kind": "request", "day": day, "url": u, "status": status, "bytes": len(body) if status == 200 else 0, "sha256": sha, "zipSignature": ok, "at": dt.datetime.utcnow().isoformat()})
        outcome.append(status)
        if status == 429:
            log({"kind": "stop", "reason": "429 rate limit", "day": day}); print("stop 429"); sys.exit(0)
        if ok:
            p = os.path.join(OUT, "zips", f"{day}.zip")
            open(p + ".tmp", "wb").write(body); os.replace(p + ".tmp", p)
            state = "STORED"; break
    if state is None:
        if all(s in (403, 404) for s in outcome) and len(outcome) == 2:
            state = "UNAVAILABLE"; consec_bad += 1
        else:
            state = "TRANSIENT"; consec_bad += 1
    log({"kind": "day", "day": day, "state": state, "statuses": outcome, "at": dt.datetime.utcnow().isoformat()})
    if consec_bad >= 25:
        # circuit breaker: probe a known-good recent file before continuing
        s, b = get(urls("2026-11-05")[0]); time.sleep(THROTTLE)
        log({"kind": "probe", "status": s, "ok": s == 200 and b[:2] == b"PK"})
        if not (s == 200 and b[:2] == b"PK"):
            log({"kind": "stop", "reason": "access failure: known-good probe failed"}); print("stop probe"); break
        consec_bad = 0
    if state == "STORED": consec_bad = 0
print("sweep pass finished", dt.datetime.utcnow().isoformat())
