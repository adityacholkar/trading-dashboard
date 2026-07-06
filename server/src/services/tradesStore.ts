import { config } from '../config.js';
import { createLogger } from '../logger.js';
import { aggregate, type Aggregates } from '../domain/aggregate.js';
import type { Trade } from '../domain/trade.js';

interface TradesResponse {
  total: number;
  generatedAt: number;
  trades: Trade[];
}

export interface Snapshot {
  trades: Trade[];
  generatedAt: number;
  fetchedAt: number;
  aggregates: Aggregates;
}

const log = createLogger('trades');

/*
Errors where trying again might help (503, network drop, timeout).
Anything else (e.g. a 404) would fail identically on every retry.
*/
class RetryableError extends Error {}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

let snapshot: Snapshot | null = null;
let inFlight: Promise<void> | null = null;
let lastError: { message: string; at: number } | null = null;

async function fetchTradesOnce(): Promise<TradesResponse> {
  let res: Response;
  try {
    // One timeout for the whole request — it also cuts off a slow
    // res.json() below, not just this fetch call.
    res = await fetch(`${config.baseURL}/api/trades`, {
      signal: AbortSignal.timeout(config.requestTimeout),
    });
  } catch (err) {
    throw new RetryableError(
      (err as Error).name === 'TimeoutError'
        ? `timed out after ${config.requestTimeout} ms`
        : `network error: ${(err as Error).message}`,
    );
  }
  if (res.status === 503) throw new RetryableError('upstream returned 503');
  if (!res.ok) throw new Error(`upstream returned unexpected status ${res.status}`);
  try {
    return (await res.json()) as TradesResponse;
  } catch (err) {
    // A 200 with an unparseable body is most likely a cut connection.
    throw new RetryableError(`bad response body: ${(err as Error).message}`);
  }
}

export async function fetchTradesWithRetry(): Promise<TradesResponse> {
  let lastErr: Error = new Error('no attempts made');
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    const started = Date.now();
    try {
      log.info(`fetch attempt ${attempt}/${config.maxAttempts}`);
      const data = await fetchTradesOnce();
      log.info(`received ${data.trades.length} trades in ${Date.now() - started} ms`);
      return data;
    } catch (err) {
      lastErr = err as Error;
      const retryable = err instanceof RetryableError;
      log.warn(`attempt ${attempt} failed after ${Date.now() - started} ms: ${lastErr.message}`);
      if (!retryable || attempt === config.maxAttempts) break;
      const backoff = config.retryDelay * 2 ** (attempt - 1);
      const jitter = backoff * config.retryJitter * (Math.random() * 2 - 1);
      const delay = Math.round(backoff + jitter);
      log.info(`retrying in ${delay} ms`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

/**
 * Single-flight refresh: concurrent callers share one upstream fetch.
 * Never rejects — on failure the previous snapshot stays in place and the
 * error is exposed via getMeta() for the UI to display.
 */
export function refresh(): Promise<void> {
  if (!inFlight) {
    inFlight = doRefresh().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function doRefresh(): Promise<void> {
  try {
    const data = await fetchTradesWithRetry();
    // Aggregate once here, so request handlers only ever return precomputed
    // results. Build the complete new snapshot first, then swap in one
    // assignment so no request can ever observe a half-updated state.
    snapshot = {
      trades: data.trades,
      generatedAt: data.generatedAt,
      fetchedAt: Date.now(),
      aggregates: aggregate(data.trades),
    };
    lastError = null;
    log.info(`snapshot updated (${data.trades.length} trades)`);
  } catch (err) {
    lastError = { message: (err as Error).message, at: Date.now() };
    log.error(`refresh failed, keeping previous snapshot: ${lastError.message}`);
  }
}

export function getSnapshot(): Snapshot | null {
  return snapshot;
}

export function getMeta() {
  return {
    hasData: snapshot !== null,
    totalTrades: snapshot?.trades.length ?? 0,
    lastUpdated: snapshot?.fetchedAt ?? null,
    generatedAt: snapshot?.generatedAt ?? null,
    refreshing: inFlight !== null,
    lastError,
  };
}
