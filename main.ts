// Dip-and-trend bot for make.fun btc-race-24h-20261111-0801.
//
// Trades Coinbase Wrapped BTC (CBBTC) against USDC, one-minute bars, long
// only, one open position at most. The whole strategy is three rules, all
// in integer basis points, all measured on closes:
//
//   1. Buy the dip: when the close is more than 1.5% below the close 240
//      bars (4 hours) ago, buy with all cash. A full-size round trip costs
//      about 26 bps in fees, slippage and price impact, so a dip buy only
//      pays when the price recovers more than that; the dev window's big
//      drop (-1.77% in one hour, -2.5% peak to trough) is exactly the kind
//      of move this catches.
//   2. Ride a strong uptrend: when the 240-bar return is above +1.0% and
//      we are flat, buy with all cash. This is the fallback for a day that
//      only goes up and never offers a dip.
//   3. Take profit: once in a position, sell everything when the close is
//      more than 1.2% above the close we bought on. Otherwise hold to the
//      end of the window; the harness flattens whatever is left.
//
//   4. Late safety: if we are still flat with 2 hours left (bar 1320),
//      buy with all cash and hold to the end. This guarantees at least one
//      trade, which the guardrails require, on a day that offers neither a
//      dip nor a trend.
//
// Why not a faster signal? One-minute returns on this pool are tiny
// (about 6 bps of noise) and flat bars are common, so any signal faster
// than a few hours trades mostly noise and pays the 26 bps round trip
// over and over. The baselines in the kit show the same: the EMA-cross
// bot makes 65 trades on the dev window and loses about $59.
//
// Local grade on the published dev window (grade-local, process driver):
// net PnL +6.69 USDC, 3 trades, maximum drawdown 1.01%, fees 1.61 USDC,
// 0 rejected orders, two executions byte-identical. That clears the dev
// gate (net PnL above $0), which is what lets the entry race.
//
// Deterministic: integer arithmetic only, no clock, no environment, no
// randomness. Every order carries max_slippage_bps 150 (1.5%), far above
// the largest one-minute move seen on the dev window (about 47 bps) plus
// slippage and impact, so a fill is almost never rejected for slippage,
// while a genuinely wild bar still cannot fill far from the last close.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const WINDOW = 240; // bars (4 hours) for the return that drives the rules
const DIP_BPS = 150; // buy when the 240-bar return is below -1.5%
const MOM_BPS = 100; // buy when the 240-bar return is above +1.0%
const TAKE_PROFIT_BPS = 120; // sell when up 1.2% from the buy close
const LATE_BAR = 1320; // with 2 hours left, buy if still flat
const MAX_SLIPPAGE_BPS = 150;
const MIN_NOTIONAL = 1_000_000n; // 1 USDC, the harness minimum for a buy

const closes: bigint[] = [];
let entryClose: bigint | null = null;

function retBps(now: bigint, then: bigint): bigint {
  // (now / then - 1) in basis points, truncated toward zero.
  return (now * 10000n) / then - 10000n;
}

await runBars({
  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const close = BigInt(bar.c);
    closes.push(close);
    const idx = closes.length - 1;

    const held = state.positions.get(SYMBOL)?.qty ?? 0n;
    if (held === 0n) entryClose = null;

    if (held === 0n) {
      if (idx < WINDOW) return [];
      const r240 = retBps(close, closes[idx - WINDOW]);
      const buy =
        r240 < -BigInt(DIP_BPS) || r240 > BigInt(MOM_BPS) || idx >= LATE_BAR;
      if (!buy) return [];
      if (state.cash <= MIN_NOTIONAL) return [];
      entryClose = close;
      return [
        {
          side: 'buy',
          symbol: SYMBOL,
          notional_quote_units: state.cash,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        },
      ];
    }

    // In a position: take profit above the buy close, otherwise hold.
    if (entryClose !== null && retBps(close, entryClose) > BigInt(TAKE_PROFIT_BPS)) {
      return [
        {
          side: 'sell',
          symbol: SYMBOL,
          qty: held,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        },
      ];
    }
    return [];
  },
});
