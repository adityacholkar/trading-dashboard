import { config } from '../config.js';

export interface Instrument {
  symbol: string;
  name: string;
  basePrice: number;
}

// The instrument list is static for the day; fetch it once and keep it so a
// page load never depends on the mock server being up.
let cache: Instrument[] | null = null;

export async function getInstruments(): Promise<Instrument[]> {
  if (cache) return cache;
  const res = await fetch(`${config.baseURL}/api/instruments`);
  if (!res.ok) throw new Error(`instruments fetch failed with status ${res.status}`);
  cache = (await res.json()) as Instrument[];
  return cache;
}
