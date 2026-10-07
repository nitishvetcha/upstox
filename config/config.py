# config/config.py

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# --------------------
# Upstox API credentials
# --------------------
UPSTOX_CLIENT_ID = os.getenv('UPSTOX_CLIENT_ID')
UPSTOX_CLIENT_SECRET = os.getenv('UPSTOX_CLIENT_SECRET')
UPSTOX_REDIRECT_URI = os.getenv('UPSTOX_REDIRECT_URI')

# --------------------
# TradingView credentials
# --------------------
TV_USERNAME = os.getenv('TV_USERNAME')
TV_PASSWORD = os.getenv('TV_PASSWORD')

# --------------------
# News API Key
# --------------------
NEWS_API_KEY = os.getenv('NEWS_API_KEY')

# --------------------
# Twitter API
# --------------------
TWITTER_BEARER_TOKEN = os.getenv('TWITTER_BEARER_TOKEN')
