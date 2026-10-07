import logging
from datetime import datetime, timedelta
import pickle
import os

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Cache file path
CACHE_FILE = "twitter_sentiment_cache.pkl"

def load_cache():
    """Load cached sentiment from file."""
    try:
        with open(CACHE_FILE, 'rb') as f:
            cache = pickle.load(f)
            return cache.get('sentiment', 0), cache.get('timestamp')
    except (FileNotFoundError, EOFError, pickle.PickleError):
        logging.warning("No cache file found or cache corrupted. Starting fresh.")
        return 0, None

def save_cache(sentiment, timestamp):
    """Save sentiment to cache file."""
    try:
        with open(CACHE_FILE, 'wb') as f:
            pickle.dump({'sentiment': sentiment, 'timestamp': timestamp}, f)
        logging.info(f"Cache saved to {CACHE_FILE}")
    except Exception as e:
        logging.error(f"Error saving cache: {e}")

# Initialize cache
cached_sentiment, last_fetch_time = load_cache()

def fetch_twitter_sentiment(query="nifty OR banknifty", limit=50):
    """
    Fetch X sentiment (disabled due to quota exhaustion).

    Args:
        query (str): X search query.
        limit (int): Number of posts to analyze.

    Returns:
        float: Default sentiment score.
    """
    global cached_sentiment, last_fetch_time

    # Use cached sentiment if within 120 minutes
    if last_fetch_time and datetime.now() - last_fetch_time < timedelta(minutes=120):
        logging.info(f"Using cached X sentiment: {cached_sentiment}")
        return cached_sentiment

    logging.warning("X API quota exhausted. Using default sentiment. Check X Developer Portal for quota reset.")
    cached_sentiment = 0  # Default to neutral
    last_fetch_time = datetime.now()
    save_cache(cached_sentiment, last_fetch_time)
    return cached_sentiment