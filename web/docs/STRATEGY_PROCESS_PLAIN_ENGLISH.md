# How the stock and options recommendation works (plain English)

**Status:** the rules below are what the software does today. **None of this is validated.** It has not been tested on data it was not built on, so every output is labelled "not validated".

## 1. The question a trader asks, and how the software answers it
A trader asks: "Is the market moving up or down, is the move confirmed, and is it worth the risk?"
The software answers the same three questions with a checklist.

```mermaid
flowchart TD
    A[Start: market data for one index or stock] --> B{Is the data live and complete?}
    B -- No --> Z1[NO TRADE: data not usable. Reason shown]
    B -- Yes --> C[Score 7 checks, total 100 points]
    C --> D{Any check missing?}
    D -- Yes --> Z2[NO TRADE: not enough data. Names the missing check]
    D -- No --> E{Total score 65 or more?}
    E -- No --> Z3[WAIT or NO TRADE: score below 65]
    E -- Yes --> F{Direction clear? bullish or bearish}
    F -- No --> Z3
    F -- Yes --> G[Pick a structure: call, call spread, put, or put spread]
    G --> H{Risk checks pass?}
    H -- No --> Z4[NO TRADE: risk limit or reward too small. Reason shown]
    H -- Yes --> I[TRADE: entry, stop, targets, size. Status: NOT VALIDATED]
```

## 2. The seven checks (total 100 points)

| Check | Points | Plain question |
|---|---|---|
| Market trend | 20 | Are the short and medium moving averages lined up, and is price above them? |
| Option chain / open interest | 20 | Are big option positions building on the side that matches the move? |
| Price action | 15 | Did recent candles make higher highs and higher lows (or the reverse)? |
| Technical indicators | 15 | RSI (momentum) and MACD (trend strength) agree? |
| Volatility / implied volatility | 10 | Is volatility in a range where options are fairly priced? |
| News sentiment | 10 | Is the news flow positive or negative, and is it current? |
| Breadth | 10 | How many index stocks rose versus fell? |

```mermaid
flowchart LR
    T[Trend 20] --> S[Total score 0 to 100]
    O[Option chain 20] --> S
    P[Price action 15] --> S
    I[Indicators 15] --> S
    V[Volatility 10] --> S
    N[News 10] --> S
    B[Breadth 10] --> S
    S --> R{65 or more?}
```

Each check says "bullish", "bearish" or "no view". The side with more points is the direction. Checks that agree with that side add points. Checks that disagree add none.

## 3. Choosing the trade shape
- **Bullish:** Long call (simple) or bull call spread (cheaper, capped profit).
- **Bearish:** Long put (simple) or bear put spread (cheaper, capped profit).

## 4. Risk rules (apply after the score)

```mermaid
flowchart TD
    A[Candidate trade] --> B[Risk per trade at most 1 percent of capital]
    B --> C[Position at most 20 percent of capital and at most 5 lots]
    C --> D[Reward to risk after costs at least 1.2 to 1]
    D --> E[Daily loss limit 2 percent and max 3 open trades]
    E --> F{All pass?}
    F -- Yes --> OK[Trade shown, not validated]
    F -- No --> NO[NO TRADE with reason]
```

## 5. Entry, stop and targets (the formulas in the code)
- **Move** = option delta times the daily average true range (ATR), i.e. the expected index move.
- **Stop** = the larger of (entry minus 0.35 times the move) and (half the entry price).
- **Target 1** = entry plus 0.5 times the move. **Target 2** = entry plus 1.0 times the move.

## 6. Daily process a human would follow
```mermaid
flowchart LR
    M1[Before 9:15: check data is live and labels say LIVE] --> M2[9:15 to 15:30: read the screen, not the phone]
    M2 --> M3[Read each check and its reason]
    M3 --> M4{Recommendation is TRADE?}
    M4 -- No --> M5[Do nothing. Log the reason]
    M4 -- Yes --> M6[Check the risk box, the stop and the size]
    M6 --> M7[Decide yourself. The app never places orders]
    M7 --> M8[After close: review the journal]
```

## 7. What is and is not true today
- **True:** the checks, weights, threshold (65) and risk rules above are in the code and tested to behave as described.
- **Not true:** that these rules make money. That has not been proven. The engine is marked NO-GO for that reason.
- **Fixed recently:** a missing 200-day average no longer lets a trade through (the F-R1 defect).
- **Missing data:** if the 200-day average is not available, the trend check is marked missing and no trade is shown.
