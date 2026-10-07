# auth_login.py
import requests
import webbrowser
import urllib.parse
import os
from dotenv import load_dotenv

load_dotenv()

CLIENT_ID = os.getenv("UPSTOX_CLIENT_ID")
CLIENT_SECRET = os.getenv("UPSTOX_CLIENT_SECRET")
REDIRECT_URI = os.getenv("UPSTOX_REDIRECT_URI")

BASE_URL = "https://api.upstox.com/v2"

def generate_authorization_url():
    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": "profile read orders trade",
    }
    url = f"{BASE_URL}/login/authorization/dialog?" + urllib.parse.urlencode(params)
    return url

def get_access_token(auth_code):
    url = f"{BASE_URL}/login/authorization/token"
    payload = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "code": auth_code,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code"
    }
    headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    }
    try:
        response = requests.post(url, data=payload, headers=headers)
        response.raise_for_status()
        return response.json()["access_token"]
    except requests.exceptions.RequestException as e:
        print(f"❌ Error fetching access token: {e}")
        return None

def login_and_get_access_token():
    if not CLIENT_ID or not CLIENT_SECRET or not REDIRECT_URI:
        print("❌ Missing Upstox API credentials. Please check your .env file.")
        return None

    print("\n🔵 Opening Upstox login page...")
    auth_url = generate_authorization_url()
    webbrowser.open(auth_url)

    auth_code = input("\nPaste the 'code' parameter from the redirected URL here: ").strip()

    if not auth_code:
        print("❌ No authorization code received.")
        return None

    access_token = get_access_token(auth_code)
    if access_token:
        print(f"\n✅ Access Token generated successfully!\n")
        # TODO: Store access_token securely for future use
    else:
        print(f"\n❌ Failed to generate Access Token.\n")
    return access_token
