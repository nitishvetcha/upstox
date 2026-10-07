# upstox_api/fetch_instruments.py

import requests
import gzip
import json
from io import BytesIO

def fetch_instruments():
    """
    Download Upstox's complete instruments file (JSON), decompress, and return a list of dicts.
    """
    url = "https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz"
    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        compressed = BytesIO(resp.content)
        with gzip.GzipFile(fileobj=compressed) as gz:
            instruments = json.load(gz)
        return instruments  # a list of instrument dicts
    except requests.HTTPError as http_err:
        print(f"HTTP error fetching instruments: {http_err}")
    except Exception as err:
        print(f"Error fetching instruments: {err}")
    return None
