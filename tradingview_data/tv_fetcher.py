from tvDatafeed import TvDatafeed, Interval
import os
import logging
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Load TradingView login credentials
load_dotenv()

def fetch_spot_data(symbol, exchange='NSE', interval=Interval.in_5_minute, bars=50):
    """
    Fetch historical spot price data from TradingView.

    Args:
        symbol (str): Index symbol, like "NIFTY", "BANKNIFTY".
        exchange (str): Exchange name (default NSE).
        interval (Interval): Timeframe (default 5-minutes).
        bars (int): Number of candles to fetch.

    Returns:
        pandas.DataFrame: Spot data with open, high, low, close, volume, or None if failed.
    """
    tv_username = os.getenv("TV_USERNAME")
    tv_password = os.getenv("TV_PASSWORD")

    if not tv_username or not tv_password:
        logging.error("TradingView credentials missing in .env file.")
        return None

    try:
        # Initialize TvDatafeed (rongardF fork recommended)
        tv = TvDatafeed(username=tv_username, password=tv_password)
        df = tv.get_hist(symbol=symbol, exchange=exchange, interval=interval, n_bars=bars)
        if df is None or df.empty:
            logging.warning(f"No data returned for {symbol} from TradingView.")
            return None
        logging.info(f"Successfully fetched spot data for {symbol}.")
        return df
    except Exception as e:
        logging.error(f"Error fetching TradingView data for {symbol}: {e}")
        logging.warning("Possibly blocked by reCAPTCHA or invalid credentials. Trying nologin mode...")
        try:
            tv = TvDatafeed()
            df = tv.get_hist(symbol=symbol, exchange=exchange, interval=interval, n_bars=bars)
            if df is None or df.empty:
                logging.warning(f"No data returned in nologin mode for {symbol}. Data may be limited.")
                return None
            logging.info(f"Fetched spot data for {symbol} in nologin mode. Note: Data may be limited.")
            return df
        except Exception as e:
            logging.error(f"Error in nologin mode for {symbol}: {e}")
            return None