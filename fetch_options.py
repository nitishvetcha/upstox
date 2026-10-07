import requests
from datetime import datetime, timedelta
import logging
import pandas as pd
from urllib.parse import quote
import os
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('option_chain_fetcher.log'),
        logging.StreamHandler()
    ]
)

# Load environment variables
load_dotenv()
CLIENT_ID = os.getenv('UPSTOX_CLIENT_ID')
CLIENT_SECRET = os.getenv('UPSTOX_CLIENT_SECRET')
REDIRECT_URI = os.getenv('UPSTOX_REDIRECT_URI')
BASE_URL = "https://api.upstox.com/v2"

def login_and_get_access_token():
    try:
        login_url = (
            f"https://api.upstox.com/v2/login/authorization/dialog?"
            f"response_type=code&client_id={CLIENT_ID}&redirect_uri={quote(REDIRECT_URI, safe='')}"
        )
        print(f"🔵 Opening Upstox login page: {login_url}")
        code = input("Paste the 'code' parameter from the redirected URL here: ")

        token_url = f"{BASE_URL}/login/authorization/token"
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        data = {
            "code": code,
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "redirect_uri": REDIRECT_URI,
            "grant_type": "authorization_code"
        }
        response = requests.post(token_url, headers=headers, data=data, timeout=15)
        response.raise_for_status()
        access_token = response.json().get("access_token")
        if access_token:
            print("✅ Access Token generated successfully!")
            return access_token
        else:
            logging.error("No access token received")
            return None
    except Exception as e:
        logging.error(f"Error during login: {e}")
        return None

def get_nearest_expiry(instrument_key, access_token):
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
        if not data:
            logging.warning(f"No option contracts for {instrument_key}")
            return None

        expiries = set(contract.get("expiry") for contract in data if contract.get("expiry"))
        if not expiries:
            logging.warning(f"No expiry dates found for {instrument_key}")
            return None

        valid_expiries = []
        for expiry in expiries:
            try:
                expiry_date = datetime.strptime(expiry, "%Y-%m-%d")
                days_to_expiry = (expiry_date - datetime.now()).days
                if 0 <= days_to_expiry <= 40:
                    valid_expiries.append(expiry)
            except ValueError:
                logging.warning(f"Invalid expiry format: {expiry}")
                continue

        if not valid_expiries:
            logging.warning(f"No valid expiries within 40 days for {instrument_key}")
            return None

        soonest_expiry = min(valid_expiries, key=lambda d: datetime.strptime(d, "%Y-%m-%d"))
        logging.info(f"Nearest expiry for {instrument_key}: {soonest_expiry}")
        return soonest_expiry
    except Exception as e:
        logging.error(f"Error fetching nearest expiry for {instrument_key}: {e}")
        return None

def fetch_spot_price(instrument_key, access_token):
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
            logging.info(f"Fetched spot price for {instrument_key}: {spot_price}")
            return float(spot_price)
        else:
            logging.warning(f"No spot price found for {instrument_key}")
            return None
    except Exception as e:
        logging.error(f"Error fetching spot price for {instrument_key}: {e}")
        return None

def fetch_option_chain(instrument_key, symbol, access_token):
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
        if not data:
            logging.warning(f"No option chain data for {symbol} on {nearest_expiry}")
            return [], None

        option_chain_data = []
        for item in data:
            strike_price = item.get("strike_price")
            call_ltp = item.get("call_options", {}).get("market_data", {}).get("ltp", 0)
            put_ltp = item.get("put_options", {}).get("market_data", {}).get("ltp", 0)
            option_chain_data.append({
                "strike_price": strike_price,
                "call_ltp": call_ltp,
                "put_ltp": put_ltp
            })
        logging.info(f"Fetched option chain for {symbol} with {len(option_chain_data)} strikes")
        
        spot_price = fetch_spot_price(instrument_key, access_token)
        return option_chain_data, spot_price
    except Exception as e:
        logging.error(f"Error fetching option chain for {symbol}: {e}")
        return None, None

def filter_strikes_near_spot(option_chain_data, spot_price, top_n=30):
    if not option_chain_data or spot_price is None:
        return pd.DataFrame()

    df = pd.DataFrame(option_chain_data)
    df['strike_diff'] = abs(df['strike_price'] - spot_price)

    above_spot = df[df['strike_price'] > spot_price].sort_values('strike_price').head(top_n)
    below_spot = df[df['strike_price'] < spot_price].sort_values('strike_price', ascending=False).head(top_n)

    filtered_df = pd.concat([below_spot, above_spot]).sort_values('strike_price')
    return filtered_df[['strike_price', 'call_ltp', 'put_ltp']]

def main():
    access_token = login_and_get_access_token()
    if not access_token:
        print("❌ Failed to authenticate with Upstox API")
        return

    indices = [
        {"symbol": "NIFTY 50", "instrument_key": "NSE_INDEX|Nifty 50"},
        {"symbol": "BANK NIFTY", "instrument_key": "NSE_INDEX|Nifty Bank"},
        {"symbol": "FINNIFTY", "instrument_key": "NSE_INDEX|Nifty Financial Services"},
        {"symbol": "BSE SENSEX", "instrument_key": "BSE_INDEX|SENSEX"}
    ]


    for index in indices:
        symbol = index["symbol"]
        instrument_key = index["instrument_key"]
        logging.info(f"Processing {symbol}...")

        option_chain_data, spot_price = fetch_option_chain(instrument_key, symbol, access_token)
        if option_chain_data is None or spot_price is None:
            print(f"❌ Failed to fetch data for {symbol}")
            continue

        filtered_strikes = filter_strikes_near_spot(option_chain_data, spot_price)
        if filtered_strikes.empty:
            print(f"❌ No valid strikes found for {symbol}")
            continue

        print(f"\n✅ Option Chain for {symbol} (Spot Price: {spot_price})")
        print(f"{'Strike Price':<15} {'Call LTP':<10} {'Put LTP':<10}")
        print("-" * 35)
        for _, row in filtered_strikes.iterrows():
            print(f"{row['strike_price']:<15} {row['call_ltp']:<10} {row['put_ltp']:<10}")
        logging.info(f"Displayed {len(filtered_strikes)} strikes for {symbol}")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n🔴 Interrupted by user. Exiting gracefully...\n")
