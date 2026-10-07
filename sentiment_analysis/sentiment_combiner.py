# sentiment_analyzer.py

from textblob import TextBlob

def analyze_sentiment(text):
    """
    Analyze the sentiment of a given text using TextBlob.

    Args:
        text (str): The text to analyze.

    Returns:
        str: 'positive', 'negative', or 'neutral'
    """
    if not text:
        return 'neutral'  # Handle empty text safely

    blob = TextBlob(text)
    polarity = blob.sentiment.polarity

    if polarity > 0.1:      # Slightly reduced threshold for sensitivity
        return 'positive'
    elif polarity < -0.1:
        return 'negative'
    else:
        return 'neutral'

def overall_sentiment(news_list, tweets_list):
    """
    Calculate overall sentiment score from news headlines and tweets.

    Args:
        news_list (list): List of news headlines.
        tweets_list (list): List of tweets.

    Returns:
        str: 'bullish', 'bearish', or 'neutral'
    """
    sentiments = []

    # Check both lists separately
    for news in news_list or []:
        sentiments.append(analyze_sentiment(news))

    for tweet in tweets_list or []:
        sentiments.append(analyze_sentiment(tweet))

    if not sentiments:
        return 'neutral'

    positive_count = sentiments.count('positive')
    negative_count = sentiments.count('negative')

    total = positive_count + negative_count

    # Added: if very low data, fallback to neutral
    if total == 0:
        return 'neutral'

    positivity_ratio = positive_count / total

    if positivity_ratio > 0.55:
        return 'bullish'
    elif positivity_ratio < 0.45:
        return 'bearish'
    else:
        return 'neutral'
