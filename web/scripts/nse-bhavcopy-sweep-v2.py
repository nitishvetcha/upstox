import os as _guard_os, sys as _guard_sys
if _guard_os.environ.get("EXTERNAL_COLLECTION_ENABLED") != "true":
    _guard_sys.stderr.write("[COLLECTION BLOCKED] nse-bhavcopy-sweep-v2.py: requires EXTERNAL_COLLECTION_ENABLED=true. No network request was sent.\n")
    _guard_sys.exit(2)

# NSE F&O bhavcopy collector v2 (corrected HTTP classification).
# Statuses per request: 200 ZIP -> STORED; 200 non-ZIP -> INVALID_RESPONSE; 404 -> NOT_FOUND;
# 403 -> BLOCKED (never counted as missing); 500/502/503/504 -> retried with exponential backoff;
# timeout/connection -> NETWORK_ERROR (retried); 429 -> run stops.
# Day state: STORED | BLOCKED_UNVERIFIED (any 403 and no ZIP) | NOT_FOUND (every URL 404) | ERROR.
# Usage: python3 nse-bhavcopy-sweep-v2.py --out <NEW_DIR> --dates <file with one YYYY-MM-DD per line>
# Resumable: days already STORED or NOT_FOUND in the manifest are skipped. Never writes to an existing run dir
# unless it already contains this script's manifest.
import os, sys, json, time, hashlib, argparse, datetime as dt, urllib.request, urllib.error, socket

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
MON = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"]
THROTTLE = 3.0                       # seconds between requests (ordinary pacing)
BACKOFF = [5, 15, 45, 120]           # exponential backoff for 5xx / network errors
MAX_BLOCKED_RUN = 5                  # stop if this many consecutive days are BLOCKED (access problem, not missing data)
FLOOR = 2 * 1024**3

def urls(day, hosts=("new","legacy")):
    y, m, d = day.split("-")
    legacy = f"https://archives.nseindia.com/content/historical/DERIVATIVES/{y}/{MON[int(m)-1]}/fo{d}{MON[int(m)-1]}{y}bhav.csv.zip"
    new = f"https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_{y}{m}{d}_F_0000.csv.zip"
    allu = {"new": new, "legacy": legacy}
    return [(h, allu[h]) for h in hosts]

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, b""
    except (urllib.error.URLError, socket.timeout, ConnectionError) as e:
        return "NETWORK_ERROR", str(e).encode()

def classify(status, body):
    if status == 200:
        return "STORED" if body[:2] == b"PK" and len(body) > 1000 else "INVALID_RESPONSE"
    if status == 404: return "NOT_FOUND"
    if status == 403: return "BLOCKED"
    if status == 429: return "RATE_LIMITED"
    if status in (500, 502, 503, 504): return "SERVER_ERROR"
    return "NETWORK_ERROR" if status == "NETWORK_ERROR" else f"HTTP_{status}"

def fetch(url):
    """Retry only transient outcomes; every attempt is returned for the log."""
    attempts = []
    for i in range(len(BACKOFF) + 1):
        status, body = get(url)
        cls = classify(status, body)
        attempts.append({"status": status, "class": cls, "bytes": len(body) if status == 200 else 0})
        time.sleep(THROTTLE)
        if cls in ("SERVER_ERROR", "NETWORK_ERROR") and i < len(BACKOFF):
            time.sleep(BACKOFF[i]); continue
        return cls, body, attempts
    return cls, body, attempts

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--dates", required=True)
    ap.add_argument("--hosts", default="new,legacy")
    a = ap.parse_args()
    hosts = tuple(a.hosts.split(","))
    os.makedirs(os.path.join(a.out, "zips"), exist_ok=True)
    man = os.path.join(a.out, "manifest.jsonl")
    done = set()
    if os.path.exists(man):
        for l in open(man):
            r = json.loads(l)
            if r.get("kind") == "day" and r.get("state") in ("STORED", "NOT_FOUND"): done.add(r["day"])
    def log(row):
        row["at"] = dt.datetime.utcnow().isoformat()
        with open(man, "a") as f: f.write(json.dumps(row) + "\n")
    days = [l.strip() for l in open(a.dates) if l.strip()]
    blocked_run = 0
    for day in days:
        if day in done: continue
        s = os.statvfs(a.out)
        if s.f_bavail * s.f_frsize < FLOOR:
            log({"kind": "stop", "reason": "disk floor"}); break
        state, reqs = None, []
        for name, u in urls(day, hosts):
            cls, body, attempts = fetch(u)
            reqs.append({"source": name, "url": u, "attempts": attempts,
                         "sha256": hashlib.sha256(body).hexdigest() if cls == "STORED" else None})
            if cls == "RATE_LIMITED":
                log({"kind": "stop", "reason": "429 rate limit", "day": day}); return
            if cls == "STORED":
                p = os.path.join(a.out, "zips", f"{day}.zip")
                open(p + ".tmp", "wb").write(body); os.replace(p + ".tmp", p)
                state = "STORED"; break
        if state is None:
            classes = [r["attempts"][-1]["class"] for r in reqs]
            if "BLOCKED" in classes: state = "BLOCKED_UNVERIFIED"
            elif all(c == "NOT_FOUND" for c in classes): state = "NOT_FOUND"
            else: state = "ERROR"
        log({"kind": "day", "day": day, "state": state, "requests": reqs})
        blocked_run = blocked_run + 1 if state == "BLOCKED_UNVERIFIED" else 0
        if blocked_run >= MAX_BLOCKED_RUN:
            log({"kind": "stop", "reason": f"{MAX_BLOCKED_RUN} consecutive BLOCKED days: access restriction, not missing data"}); break
    print("pass finished", dt.datetime.utcnow().isoformat())

if __name__ == "__main__":
    main()
