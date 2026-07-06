export interface Summary {
  grossPnl: number;
  netPnl: number;
  totalTrades: number;
  totalBrokerage: number;
  winRate: number; // fraction 0..1
}

export interface InstrumentRow {
  symbol: string;
  trades: number;
  totalQuantity: number;
  netPnl: number;
}

export interface DailyPnlPoint {
  date: string;
  netPnl: number;
}

export interface Instrument {
  symbol: string;
  name: string;
  basePrice: number;
}

export interface Meta {
  hasData: boolean;
  totalTrades: number;
  lastUpdated: number | null;
  generatedAt: number | null;
  refreshing: boolean;
  lastError: { message: string; at: number } | null;
}

/** The backend has booted but its first trades fetch hasn't landed yet. */
export class WarmingUpError extends Error {}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (res.status === 503) throw new WarmingUpError();
  if (!res.ok) throw new Error(`${path} failed with status ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  meta: () => get<Meta>('/api/meta'),
  summary: () => get<Summary>('/api/summary'),
  instrumentsPerformance: () => get<InstrumentRow[]>('/api/instruments-performance'),
  dailyPnl: () => get<DailyPnlPoint[]>('/api/daily-pnl'),
  instruments: () => get<Instrument[]>('/api/instruments'),
  refresh: () => fetch('/api/refresh', { method: 'POST' }),
};
