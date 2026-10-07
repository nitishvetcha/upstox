# fetch_historical_data.py

import requests
import pandas as pd
from datetime import datetime, timedelta
import logging
from urllib.parse import quote
from tenacity import retry, stop_after_attempt, wait_exponential

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

BASE_URL = "https://api.upstox.com/v2"

# Mapping Index Spot to Futures Instruments (for fetching historical candles)
INDEX_TO_FUTURES_MAPPING = {
    "NSE_INDEX|Nifty 50": "NSE_FO|NIFTY25APR24FUT",     # Update expiry manually each month
    "NSE_INDEX|Nifty Bank": "NSE_FO|BANKNIFTY25APR24FUT",
}

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
def fetch_historical_data_with_retry(url, headers, timeout):
    logging.debug(f"Attempting to fetch URL: {url}")
    response = requests.get(url, headers=headers, timeout=timeout)
    response.raise_for_status()
    return response

def fetch_historical_data(instrument_key, access_token, interval="5minute", days=10):
    """
    Fetch historical OHLC data from Upstox API with retry logic.

    Args:
        instrument_key (str): The instrument key (e.g., "NSE_INDEX|Nifty 50").
        access_token (str): The Upstox access token.
        interval (str): Timeframe (e.g., "5minute").
        days (int): Number of days of historical data to fetch.

    Returns:
        pandas.DataFrame: Historical data or None if failed.
    """
    # Handle Index -> Futures mapping
    instrument_key_for_fetch = INDEX_TO_FUTURES_MAPPING.get(instrument_key, instrument_key)

    # Determine last trading day
    today = datetime.now()
    if today.weekday() >= 5:  # Saturday (5) or Sunday (6)
        last_trading_day = today - timedelta(days=today.weekday() - 4)
    else:
        last_trading_day = today

    end_date = last_trading_day.strftime("%Y-%m-%d")
    start_date = (last_trading_day - timedelta(days=days)).strftime("%Y-%m-%d")

    # Encode instrument_key
    encoded_instrument_key = quote(instrument_key_for_fetch, safe='')

    # Construct URL
    url = f"{BASE_URL}/historical-candle/{encoded_instrument_key}/{interval}/{end_date}/{start_date}"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json"
    }
    logging.debug(f"Constructed historical data URL: {url}")

    try:
        response = fetch_historical_data_with_retry(url, headers, 15)
        data = response.json().get("data", {}).get("candles", [])
        logging.debug(f"Historical data response for {instrument_key_for_fetch}: {response.json()}")
        if not data:
            logging.warning(f"No historical data available for {instrument_key_for_fetch} from {start_date} to {end_date}")
            return None

        # Convert to DataFrame
        df = pd.DataFrame(
            data,
            columns=["timestamp", "open", "high", "low", "close", "volume", "oi"]
        )
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        df = df[["timestamp", "open", "high", "low", "close", "volume"]]
        df["symbol"] = instrument_key  # Keep original symbol for clarity
        logging.info(f"Successfully fetched historical data for {instrument_key} with {len(df)} candles")
        return df
    except requests.exceptions.HTTPError as http_err:
        logging.error(f"HTTP error fetching historical data for {instrument_key}: {http_err}")
        return None
    except requests.exceptions.InvalidURL as url_err:
        logging.error(f"Invalid URL for historical data fetch for {instrument_key}: {url_err}")
        return None
    except Exception as e:
        logging.error(f"Error fetching historical data for {instrument_key}: {e}")
        return None
