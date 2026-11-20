# Quantity-freeze field: status (2026-11-08)

quantityFreezeStatus = UNCONFIRMED. Do not use any value from this file for trading or risk enforcement.

Facts established:
- NSE/FAOP/61157 (15 March 2024) discontinued Qtyfreeze.csv and says quantity-freeze information is in the MII contract file. It does not name the MII column.
- The MII contract file header contains MaxTradQty, MaxSnglTxnQty (empty for all active rows), WrngQty (0), MinPric and MaxPric. None is labelled as a quantity freeze.

Not established:
- Whether MaxTradQty is the freeze limit, a maximum order quantity, or something else.
- The effective date, scope by underlying or expiry, and any limitations.
- NSE/MSD/60315 (19 January 2024) could not be located by web search. Secondary sources (brokers) quote index limits of NIFTY 1800 and BANKNIFTY 900 (2024), and report a later revision effective October 2026. These are not primary sources and conflict with each other.

The MII file's MaxTradQty for NIFTY is 1801 (not 1800). That difference is not explained by any verified source.

Observation (hypothesis only, not verified): MaxTradQty for index options is NIFTY 1801, FINNIFTY 1801, BANKNIFTY 901, MIDCPNIFTY 2801, NIFTYNXT50 601, NIFTYFPI 8501. Each is 1 more than the secondary-source freeze figures for NIFTY (1800) and BANKNIFTY (900). This could mean MaxTradQty is an exclusive bound on the freeze limit, but that is not established.
