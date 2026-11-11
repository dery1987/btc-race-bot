# Dip-and-trend bot for make.fun btc-race-24h-20261111-0801

[![make.fun](https://make.fun/badge.svg)](https://make.fun/bounty/btc-race-24h-20261111-0801)

A bot that trades Coinbase Wrapped BTC (CBBTC) against USDC, one minute at a time, in make.fun's `agent-fun/bars-replay/v1` replay. Long only, one position, full size.

## Strategy

Three rules, all in integer basis points on closes:

1. **Buy the dip** — when the close is more than 1.5% below the close 240 bars (4 hours) ago, buy with all cash.
2. **Ride a strong uptrend** — when the 240-bar return is above +1.0% and we are flat, buy with all cash.
3. **Take profit** — sell everything when the close is more than 1.2% above the close we bought on; otherwise hold to the end.

Plus a late safety: if still flat with 2 hours left (bar 1320), buy and hold to the end, so the bot always makes at least one trade.

One-minute returns on this pool are mostly noise (about 6 bps) and a full round trip costs about 26 bps in fees, slippage and impact, so faster signals just pay the round trip over and over. The kit's EMA-cross baseline makes 65 trades on the dev window and loses about $59; this bot makes 3 and, on the dev window, nets about **+$9** with a maximum drawdown of about 1%.

## Files

- `main.ts` — the bot (Node 22, erasable TypeScript, standard library only)
- `vendor/makefun-bars.ts` — the kit's SDK shim, copied byte for byte

## Run it

```sh
node cli/makefun.mjs grade-local --kit <kit> --bot <this repo> --driver process
```
