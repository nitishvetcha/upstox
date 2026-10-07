import requests
from datetime import datetime, timedelta
import logging
import pickle
import os

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Cache file path
CACHE_FILE = "option_chain_cache.pkl"

def load_cache(symbol):
    """Load cached option chain data."""
    try:
        with open(CACHE_FILE, 'rb') as f:
            cache = pickle.load(f)
            if cache['symbol'] == symbol and datetime.now() - cache['timestamp'] < timedelta(minutes=30):
                return cache['data']
        return None
    except (FileNotFoundError, EOFError, pickle.PickleError):
        return None

def save_cache(symbol, data):
    """Save option chain data to cache."""
    try:
        with open(CACHE_FILE, 'wb') as f:
            pickle.dump({'symbol': symbol, 'data': data, 'timestamp': datetime.now()}, f)
        logging.info(f"Option chain cache saved for {symbol}")
    except Exception as e:
        logging.error(f"Error saving option chain cache: {e}")

BASE_URL = "https://api.upstox.com/v2"

def get_nearest_expiry(instrument_key, access_token):
    """
    Fetch the nearest expiry date for a given instrument within 30 days.
    
    Args:
        instrument_key (str): The instrument key (e.g., "NSE_INDEX|Nifty 50").
        access_token (str): The Upstox access token.
    
    Returns:
        str: The nearest expiry date in "YYYY-MM-DD" format, or None if no valid expiries.
    """
    url = f"{BASE_URL}/option/contract"
    params = {"instrument_key": instrument_key}
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json"
    }
    try:
        response = requests.get(url, headers=headers, params=params, timeout=15)
        response.raise_for_status()
        data = response.json().get("data", [])
        logging.debug(f"Raw option contract response for {instrument_key}: {response.json()}")
        if not data:
            logging.warning(f"No option contracts found for {instrument_key}")
            return None
        
        expiries = set(contract.get("expiry") for contract in data if contract.get("expiry"))
        logging.debug(f"All expiries for {instrument_key}: {expiries}")
        if not expiries:
            logging.warning(f"No expiry dates found for {instrument_key}")
            return None

        # Filter expiries within 30 days
        valid_expiries = []
        for expiry in expiries:
            try:
                expiry_date = datetime.strptime(expiry, "%Y-%m-%d")
                if (expiry_date - datetime.now()).days <= 90:
                    valid_expiries.append(expiry)
            except ValueError:
                logging.warning(f"Invalid expiry format for {instrument_key}: {expiry}")
                continue
        
        if not valid_expiries:
            logging.warning(f"No expiries within 30 days for {instrument_key}")
            return None
        
        soonest_expiry = min(valid_expiries, key=lambda d: datetime.strptime(d, "%Y-%m-%d"))
        logging.info(f"Nearest expiry for {instrument_key}: {soonest_expiry}")
        return soonest_expiry
    except Exception as e:
        logging.error(f"Error getting nearest expiry for {instrument_key}: {e}")
        return None

def fetch_option_chain(symbol, access_token):
    """
    Fetch option chain data and spot price for a symbol from Upstox with caching.
    
    Args:
        symbol (str): The symbol (e.g., "NIFTY 50").
        access_token (str): The Upstox access token.
    
    Returns:
        tuple: (list of dictionaries with strike_price, call_ltp, put_ltp, call_delta, put_delta, float spot_price) or (None, None) if failed.
    """
    # Check cache
    cached_data = load_cache(symbol)
    if cached_data:
        logging.info(f"Using cached option chain data for {symbol}")
        spot_price = fetch_spot_price(symbol, access_token)
        return cached_data, spot_price

    symbol_to_instrument_key = {
        "NIFTY 50": "NSE_INDEX|Nifty 50",
        "BANK NIFTY": "NSE_INDEX|Nifty Bank",
        "FIN NIFTY": "NSE_INDEX|Nifty Financial Services"
    }
    
    instrument_key = symbol_to_instrument_key.get(symbol)
    if not instrument_key:
        raise ValueError(f"Unsupported symbol: {symbol}")
    
    nearest_expiry = get_nearest_expiry(instrument_key, access_token)
    if not nearest_expiry:
        print(f"❌ No expiry found for {symbol}")
        return None, None

    url = f"{BASE_URL}/option/chain"
    params = {
        "instrument_key": instrument_key,
        "expiry_date": nearest_expiry
    }
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json"
    }
    try:
        response = requests.get(url, headers=headers, params=params, timeout=15)
        response.raise_for_status()
        data = response.json().get("data", [])
        logging.debug(f"Option chain response for {symbol}: {data}")
        if not data:
            logging.warning(f"No option chain data available for {symbol} on {nearest_expiry}")
            return [], None
        
        option_chain_data = []
        for item in data:
            strike_price = item.get("strike_price")
            call_ltp = item.get("call_options", {}).get("market_data", {}).get("ltp", 0)
            put_ltp = item.get("put_options", {}).get("market_data", {}).get("ltp", 0)
            call_delta = item.get("call_options", {}).get("greeks", {}).get("delta", 0)
            put_delta = item.get("put_options", {}).get("greeks", {}).get("delta", 0)
            option_chain_data.append({
                "strike_price": strike_price,
                "call_ltp": call_ltp,
                "put_ltp": put_ltp,
                "call_delta": call_delta,
                "put_delta": put_delta,
                "symbol": symbol
            })
        logging.info(f"Fetched option chain data for {symbol} with {len(option_chain_data)} strikes")
        
        # Fetch spot price
        spot_price = fetch_spot_price(symbol, access_token)
        
        # Save to cache
        save_cache(symbol, option_chain_data)
        return option_chain_data, spot_price
    except requests.exceptions.HTTPError as http_err:
        logging.error(f"HTTP error fetching option chain for {symbol}: {http_err}")
    except Exception as e:
        logging.error(f"Error fetching option chain for {symbol}: {e}")
    return None, None

def fetch_spot_price(symbol, access_token):
    """
    Fetch the current spot price for a symbol from Upstox API.

    Args:
        symbol (str): The symbol (e.g., "NIFTY 50").
        access_token (str): The Upstox access token.

    Returns:
        float: Spot price, or None if failed.
    """
    symbol_to_instrument_key = {
        "NIFTY 50": "NSE_INDEX|Nifty 50",
        "BANK NIFTY": "NSE_INDEX|Nifty Bank",
        "FIN NIFTY": "NSE_INDEX|Nifty Financial Services"
    }
    
    instrument_key = symbol_to_instrument_key.get(symbol)
    if not instrument_key:
        logging.error(f"Unsupported symbol for spot price: {symbol}")
        return None
    
    url = f"{BASE_URL}/market-quote/quotes"
    params = {"instrument_key": instrument_key}
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json"
    }
    try:
        response = requests.get(url, headers=headers, params=params, timeout=15)
        response.raise_for_status()
        data = response.json().get("data", {})
        spot_price = None
        for key, value in data.items():
            if instrument_key in key or instrument_key.replace("|", ":") in key:
                spot_price = value.get("last_price") or value.get("ohlc", {}).get("close")
                break
        if spot_price:
            logging.info(f"Fetched spot price for {symbol}: {spot_price}")
            return float(spot_price)
        else:
            logging.warning(f"No valid spot price in response for {symbol}. Response: {data}")
            return None
    except requests.exceptions.HTTPError as http_err:
        logging.error(f"HTTP error fetching spot price for {symbol}: {http_err}")
        return None
    except Exception as e:
        logging.error(f"Error fetching spot price for {symbol}: {e}")
        return None