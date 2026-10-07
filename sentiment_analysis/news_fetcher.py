# sentiment_analysis/news_fetcher.py

import requests
from config.config import NEWS_API_KEY

def fetch_news_sentiment(query="nifty OR banknifty", language="en"):
    """
    Fetch latest news headlines related to Nifty/Banknifty.

    Args:
        query (str): Search query keywords.
        language (str): Language of news articles.

    Returns:
        sentiment_score (float): Simple sentiment score (+ve = positive, -ve = negative).
    """
    url = f"https://newsapi.org/v2/everything"
    params = {
        'q': query,
        'language': language,
        'apiKey': NEWS_API_KEY,
        'sortBy': 'publishedAt',  # New: get latest news first
        'pageSize': 10            # New: fetch exactly 10 articles
    }

    try:
        response = requests.get(url, params=params)
        response.raise_for_status()  # Will raise error for bad responses

        articles = response.json().get('articles', [])

        positive_keywords = ['up', 'rally', 'gain', 'bull', 'positive', 'surge', 'soar']
        negative_keywords = ['down', 'fall', 'loss', 'bear', 'negative', 'drop', 'plunge']

        sentiment_score = 0

        for article in articles:
            title = article.get('title', '').lower()
            description = article.get('description', '').lower()

            combined_text = title + " " + description

            if any(word in combined_text for word in positive_keywords):
                sentiment_score += 1
            if any(word in combined_text for word in negative_keywords):
                sentiment_score -= 1

        return sentiment_score

    except Exception as e:
        print(f"❌ Error fetching news sentiment: {e}")
        return 0
