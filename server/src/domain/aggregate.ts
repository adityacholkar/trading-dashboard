import type { Trade } from './trade.js';

export interface Summary {
  grossPnl: number;
  netPnl: number;
  totalTrades: number;
  totalBrokerage: number;
  winRate: number; // fraction 0..1; a win is netPnl > 0
}

export interface InstrumentRow {
  symbol: string;
  trades: number;
  totalQuantity: number;
  netPnl: number;
}

export interface DailyPnlPoint {
  date: string; // YYYY-MM-DD
  netPnl: number;
}

export interface Aggregates {
  summary: Summary;
  byInstrument: InstrumentRow[];
  dailyPnl: DailyPnlPoint[];
}

// Rounds a currency amount to 2 decimal places (paise precision) for API
// responses. Sums are accumulated at full float precision first, so rounding
// error never compounds across trades.
const roundToTwoDecimals = (amount: number): number => Math.round(amount * 100) / 100;

/**
 * Computes everything the dashboard shows in a single pass over the trades.
 * Runs once per snapshot refresh, never per request. Accumulates at full
 * precision and rounds only in the returned objects.
 */
interface SymbolAccumulator {
  trades: number;
  totalQuantity: number;
  netPnl: number;
}

export function aggregate(trades: Trade[]): Aggregates {
  let gross: number = 0;
  let net: number = 0;
  let brokerage: number = 0;
  let winners: number = 0;
  const bySymbol: Map<string, SymbolAccumulator> = new Map();
  const byDate: Map<string, number> = new Map();

  for (const t of trades) {
    const tradeGross: number = (t.sellPrice - t.buyPrice) * t.quantity;
    const tradeNet: number = tradeGross - t.brokerage;
    gross += tradeGross;
    net += tradeNet;
    brokerage += t.brokerage;
    if (tradeNet > 0) winners++;

    let row: SymbolAccumulator | undefined = bySymbol.get(t.symbol);
    if (!row) {
      row = { trades: 0, totalQuantity: 0, netPnl: 0 };
      bySymbol.set(t.symbol, row);
    }
    row.trades++;
    row.totalQuantity += t.quantity;
    row.netPnl += tradeNet;

    byDate.set(t.tradeDate, (byDate.get(t.tradeDate) ?? 0) + tradeNet);
  }

  const byInstrument: InstrumentRow[] = [...bySymbol.entries()]
    .map(([symbol, row]: [string, SymbolAccumulator]): InstrumentRow => ({
      symbol,
      trades: row.trades,
      totalQuantity: row.totalQuantity,
      netPnl: roundToTwoDecimals(row.netPnl),
    }))
    .sort((a: InstrumentRow, b: InstrumentRow): number => b.netPnl - a.netPnl);

  const dailyPnl: DailyPnlPoint[] = [...byDate.entries()]
    .map(([date, dayNet]: [string, number]): DailyPnlPoint => ({ date, netPnl: roundToTwoDecimals(dayNet) }))
    .sort((a: DailyPnlPoint, b: DailyPnlPoint): number => a.date.localeCompare(b.date));

  return {
    summary: {
      grossPnl: roundToTwoDecimals(gross),
      netPnl: roundToTwoDecimals(net),
      totalTrades: trades.length,
      totalBrokerage: roundToTwoDecimals(brokerage),
      winRate: trades.length === 0 ? 0 : Math.round((winners / trades.length) * 10000) / 10000,
    },
    byInstrument,
    dailyPnl,
  };
}
