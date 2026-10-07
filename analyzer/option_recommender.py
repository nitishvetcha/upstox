import pandas as pd
import numpy as np
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def calculate_trade_params(entry_price):
    """Calculate stop loss and targets for a trade."""
    stop_loss = round(entry_price * 0.7, 2)  # 30% stop loss
    target1 = round(entry_price * 1.2, 2)    # 20% target
    target2 = round(entry_price * 1.5, 2)    # 50% target
    return stop_loss, target1, target2

def generate_recommendations(spot_price, option_chain_data, news_sentiment, twitter_sentiment, spot_data=None):
    """
    Generate 1-3 trading recommendations using option Greeks and sentiment, without historical data.

    Args:
        spot_price (float): Current spot price.
        option_chain_data (list): List of dictionaries with strike_price, call_ltp, put_ltp, call_delta, put_delta.
        news_sentiment (float): News sentiment score (0-10).
        twitter_sentiment (float): X sentiment score (-1 to 1).
        spot_data (pandas.DataFrame, optional): Ignored (historical data not used).

    Returns:
        list: Up to 3 recommendation dictionaries (bullish, bearish, neutral).
    """
    try:
        if spot_price is None:
            logging.error("Spot price is None")
            return [{"error": "Spot price unavailable"}]

        option_df = pd.DataFrame(option_chain_data)
        if option_df.empty:
            logging.error("Option chain DataFrame is empty")
            return [{"error": "Empty option chain data"}]

        # Ensure liquidity: filter options with non-zero LTP
        liquid_options = option_df[(option_df['call_ltp'] > 0) | (option_df['put_ltp'] > 0)]
        if liquid_options.empty:
            logging.warning("No liquid options found; attempting fallback to any strike")
            # Fallback: select closest strike to spot_price
            option_df['strike_diff'] = abs(option_df['strike_price'] - spot_price)
            liquid_options = option_df[option_df['strike_diff'] == option_df['strike_diff'].min()]
            if liquid_options.empty:
                logging.error("No options available even after fallback")
                return [{"error": "No liquid options available"}]
        
        logging.debug(f"Liquid options count: {len(liquid_options)}")
        logging.debug(f"Sample option data: {liquid_options.head(2).to_dict('records')}")

        # Dynamic sentiment weighting
        if twitter_sentiment == 0:
            combined_sentiment = news_sentiment / 10
        else:
            combined_sentiment = (news_sentiment / 10) * 0.8 + twitter_sentiment * 0.2
        # Boost for NIFTY 50 bullish trend
        symbol = liquid_options.get('symbol', 'NIFTY 50').iloc[0] if 'symbol' in liquid_options else 'NIFTY 50'
        if "Nifty 50" in symbol:
            combined_sentiment = min(combined_sentiment + 0.2, 1.0)
        
        logging.debug(f"Combined sentiment for {symbol}: {combined_sentiment}")

        signals = [f"News Sentiment: {news_sentiment}/10", f"X Sentiment: {twitter_sentiment}"]
        if combined_sentiment >= 0.3:
            signals.append("Bullish Sentiment")
        elif combined_sentiment < -0.3:
            signals.append("Bearish Sentiment")
        else:
            signals.append("Neutral Sentiment")

        recommendations = []

        # 1. Bullish Recommendation (Call Option)
        if combined_sentiment >= 0.3:
            # Prefer delta ~0.5 for ATM calls; fallback to strike
            if 'call_delta' in liquid_options and liquid_options['call_delta'].notnull().any():
                call_options = liquid_options[liquid_options['call_ltp'] > 0]
                call_options = call_options[np.abs(call_options['call_delta'] - 0.5) < 0.1]
                call_options = call_options.sort_values('strike_price')
                logging.debug(f"Bullish: Found {len(call_options)} call options with delta ~0.5")
            else:
                call_options = liquid_options[liquid_options['strike_price'] >= spot_price]
                call_options = call_options[call_options['call_ltp'] > 0].sort_values('strike_price')
                logging.debug(f"Bullish: Found {len(call_options)} call options by strike >= {spot_price}")
            
            if call_options.empty:
                logging.warning("No valid call options for bullish recommendation")
                # Fallback to closest strike
                call_options = liquid_options[liquid_options['call_ltp'] > 0].sort_values(
                    by='strike_price', key=lambda x: abs(x - spot_price)
                )
                logging.debug(f"Bullish fallback: Found {len(call_options)} call options by closest strike")
            
            if not call_options.empty:
                strike = call_options.iloc[0]['strike_price']
                entry_price = call_options.iloc[0]['call_ltp']
                stop_loss, target1, target2 = calculate_trade_params(entry_price)
                recommendations.append({
                    'action': 'Buy Call Option',
                    'strike_price': strike,
                    'entry_price': entry_price,
                    'initial_stoploss': stop_loss,
                    'target1': target1,
                    'target2': target2,
                    'signals': signals
                })
                logging.info(f"Bullish recommendation added for {symbol}: strike {strike}, entry {entry_price}")

        # 2. Bearish Recommendation (Put Option)
        if combined_sentiment < -0.3:
            # Prefer delta ~-0.5 for ATM puts; fallback to strike
            if 'put_delta' in liquid_options and liquid_options['put_delta'].notnull().any():
                put_options = liquid_options[liquid_options['put_ltp'] > 0]
                put_options = put_options[np.abs(put_options['put_delta'] + 0.5) < 0.1]
                put_options = put_options.sort_values('strike_price', ascending=False)
                logging.debug(f"Bearish: Found {len(put_options)} put options with delta ~-0.5")
            else:
                put_options = liquid_options[liquid_options['strike_price'] <= spot_price]
                put_options = put_options[liquid_options['put_ltp'] > 0].sort_values('strike_price', ascending=False)
                logging.debug(f"Bearish: Found {len(put_options)} put options by strike <= {spot_price}")
            
            if put_options.empty:
                logging.warning("No valid put options for bearish recommendation")
                # Fallback to closest strike
                put_options = liquid_options[liquid_options['put_ltp'] > 0].sort_values(
                    by='strike_price', key=lambda x: abs(x - spot_price)
                )
                logging.debug(f"Bearish fallback: Found {len(put_options)} put options by closest strike")
            
            if not put_options.empty:
                strike = put_options.iloc[0]['strike_price']
                entry_price = put_options.iloc[0]['put_ltp']
                stop_loss, target1, target2 = calculate_trade_params(entry_price)
                recommendations.append({
                    'action': 'Buy Put Option',
                    'strike_price': strike,
                    'entry_price': entry_price,
                    'initial_stoploss': stop_loss,
                    'target1': target1,
                    'target2': target2,
                    'signals': signals
                })
                logging.info(f"Bearish recommendation added for {symbol}: strike {strike}, entry {entry_price}")

        # 3. Neutral Recommendation (Straddle)
        # Always generate a straddle to ensure at least one recommendation
        option_df['strike_diff'] = abs(option_df['strike_price'] - spot_price)
        atm_option = option_df[option_df['strike_diff'] == option_df['strike_diff'].min()]
        logging.debug(f"Neutral: Found {len(atm_option)} ATM options for straddle")
        if not atm_option.empty:
            strike = atm_option.iloc[0]['strike_price']
            call_entry = atm_option.iloc[0]['call_ltp']
            put_entry = atm_option.iloc[0]['put_ltp']
            if call_entry > 0 and put_entry > 0:
                call_sl, call_t1, call_t2 = calculate_trade_params(call_entry)
                put_sl, put_t1, put_t2 = calculate_trade_params(put_entry)
                recommendations.append({
                    'action': 'Buy Straddle (Call + Put)',
                    'strike_price': strike,
                    'entry_price': round(call_entry + put_entry, 2),
                    'initial_stoploss': round(min(call_sl, put_sl), 2),
                    'target1': round(max(call_t1, put_t1), 2),
                    'target2': round(max(call_t2, put_t2), 2),
                    'signals': signals
                })
                logging.info(f"Neutral recommendation added for {symbol}: strike {strike}, entry {call_entry + put_entry}")

        if not recommendations:
            logging.error(f"No recommendations generated for {symbol}. Sentiment: {combined_sentiment}, Liquid options: {len(liquid_options)}")
            return [{"error": "No valid recommendations based on current market conditions"}]

        logging.info(f"Generated {len(recommendations)} recommendations for {symbol}")
        return recommendations[:3]  # Return up to 3 recommendations

    except Exception as e:
        logging.error(f"Error generating recommendations: {e}")
        return [{"error": str(e)}]