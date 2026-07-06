import { describe, expect, it } from 'vitest';
import { aggregate } from './aggregate.js';
import type { Trade } from './trade.js';

let nextId = 0;

function trade(overrides: Partial<Trade>): Trade {
  return {
    id: `T${++nextId}`,
    symbol: 'RELIANCE',
    quantity: 10,
    buyPrice: 100,
    sellPrice: 110,
    brokerage: 20,
    tradeDate: '2026-07-01',
    timestamp: 1,
    ...overrides,
  };
}

describe('aggregate', () => {
  it('returns zeroed summary and empty lists for no trades', () => {
    const result = aggregate([]);
    expect(result.summary).toEqual({
      grossPnl: 0,
      netPnl: 0,
      totalTrades: 0,
      totalBrokerage: 0,
      winRate: 0,
    });
    expect(result.byInstrument).toEqual([]);
    expect(result.dailyPnl).toEqual([]);
  });

  it('computes gross, net, brokerage and win rate', () => {
    const trades = [
      // gross +100, net +80 — a winner
      trade({ quantity: 10, buyPrice: 100, sellPrice: 110, brokerage: 20 }),
      // gross -50, net -60 — a loser
      trade({ quantity: 5, buyPrice: 110, sellPrice: 100, brokerage: 10 }),
      // gross +10, net -5 — gross winner but net loser: must NOT count as a win
      trade({ quantity: 1, buyPrice: 100, sellPrice: 110, brokerage: 15 }),
    ];
    const { summary } = aggregate(trades);
    expect(summary.grossPnl).toBe(60);
    expect(summary.netPnl).toBe(15);
    expect(summary.totalBrokerage).toBe(45);
    expect(summary.totalTrades).toBe(3);
    expect(summary.winRate).toBeCloseTo(1 / 3, 4);
  });

  it('groups by symbol and sorts by net P&L descending', () => {
    const trades = [
      trade({ symbol: 'TCS', quantity: 1, buyPrice: 100, sellPrice: 110, brokerage: 0 }), // +10
      trade({ symbol: 'INFY', quantity: 1, buyPrice: 100, sellPrice: 300, brokerage: 0 }), // +200
      trade({ symbol: 'TCS', quantity: 2, buyPrice: 100, sellPrice: 120, brokerage: 5 }), // +35
    ];
    const { byInstrument } = aggregate(trades);
    expect(byInstrument).toEqual([
      { symbol: 'INFY', trades: 1, totalQuantity: 1, netPnl: 200 },
      { symbol: 'TCS', trades: 2, totalQuantity: 3, netPnl: 45 },
    ]);
  });

  it('groups daily P&L by date in chronological order', () => {
    const trades = [
      trade({ tradeDate: '2026-07-02', quantity: 1, buyPrice: 0, sellPrice: 5, brokerage: 0 }),
      trade({ tradeDate: '2026-07-01', quantity: 1, buyPrice: 0, sellPrice: 3, brokerage: 1 }),
      trade({ tradeDate: '2026-07-02', quantity: 1, buyPrice: 5, sellPrice: 0, brokerage: 0 }),
    ];
    const { dailyPnl } = aggregate(trades);
    expect(dailyPnl).toEqual([
      { date: '2026-07-01', netPnl: 2 },
      { date: '2026-07-02', netPnl: 0 },
    ]);
  });

  it('rounds to 2 decimals only at the edges, not per trade', () => {
    // 0.1 + 0.2 style float dust: 1000 trades of net 0.005 each.
    // Per-trade rounding would give 0 or 10 depending on rounding mode;
    // full-precision accumulation gives exactly 5.00.
    const trades = Array.from({ length: 1000 }, () =>
      trade({ quantity: 1, buyPrice: 1, sellPrice: 1.005, brokerage: 0 }),
    );
    const { summary } = aggregate(trades);
    expect(summary.netPnl).toBe(5);
  });
});
