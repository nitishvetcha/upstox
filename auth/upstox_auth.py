# auth/upstox_auth.py

import requests
import webbrowser
from config.config import UPSTOX_CLIENT_ID, UPSTOX_CLIENT_SECRET, UPSTOX_REDIRECT_URI

def login_upstox():
    """
    Handles Upstox dynamic login to get access_token
    """

    api_key = UPSTOX_CLIENT_ID
    api_secret = UPSTOX_CLIENT_SECRET
    redirect_uri = UPSTOX_REDIRECT_URI

    if not all([api_key, api_secret, redirect_uri]):
        print("\n❌ Missing Upstox API credentials in .env file. Please check.\n")
        return None

    # Step 1: Open login URL
    login_url = (
        f"https://api.upstox.com/v2/login/authorization/dialog"
        f"?response_type=code"
        f"&client_id={api_key}"
        f"&redirect_uri={redirect_uri}"
    )
    print(f"\n👉 Open the following URL in your browser and login:\n\n{login_url}\n")
    webbrowser.open(login_url)

    # Step 2: Get authorization code from URL after login
    auth_code = input("\n📋 Paste the authorization 'code' you received in the URL after login: ").strip()

    if not auth_code:
        print("\n❌ No Authorization Code entered. Exiting.\n")
        return None

    # Step 3: Exchange auth_code for access_token
    token_url = "https://api.upstox.com/v2/login/authorization/token"

    payload = {
        "code": auth_code,
        "client_id": api_key,
        "client_secret": api_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code"
    }

    headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    }

    try:
        response = requests.post(token_url, data=payload, headers=headers)
        response.raise_for_status()
        access_token = response.json().get("access_token")
        
        if access_token:
            print("\n✅ Successfully obtained Access Token.\n")
            return access_token
        else:
            print("\n❌ No Access Token found in response.\n")
            return None

    except requests.exceptions.HTTPError as e:
        print(f"\n❌ HTTP Error: {e} | Details: {response.text}\n")
        return None
    except Exception as e:
        print(f"\n❌ Unexpected Error: {e}\n")
        return None
