import { beforeEach, describe, expect, it, vi } from 'vitest';

// Quiet the retry/backoff log lines in test output.
process.env.LOG_LEVEL = 'error';

const payload = (trades: unknown[] = [], generatedAt = 123) => ({
  total: trades.length,
  generatedAt,
  trades,
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const status = (code: number) => ({ ok: false, status: code, json: async () => ({}) });

const sampleTrade = {
  id: 'T1',
  symbol: 'TCS',
  quantity: 1,
  buyPrice: 100,
  sellPrice: 110,
  brokerage: 2,
  tradeDate: '2026-07-01',
  timestamp: 1,
};

/**
 * tradesStore keeps module-level state (snapshot, in-flight promise), so each
 * test gets a fresh copy via resetModules + dynamic import. Backoff delays are
 * zeroed so retry tests run instantly.
 */
async function freshStore() {
  vi.resetModules();
  const { config } = await import('../config.js');
  config.retryDelay = 0;
  config.retryJitter = 0;
  return import('./tradesStore.js');
}

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
});

describe('fetchTradesWithRetry', () => {
  it('retries on 503 and succeeds on a later attempt', async () => {
    const store = await freshStore();
    fetchMock
      .mockResolvedValueOnce(status(503))
      .mockResolvedValueOnce(status(503))
      .mockResolvedValueOnce(ok(payload([sampleTrade])));

    const data = await store.fetchTradesWithRetry();
    expect(data.trades).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries on network errors', async () => {
    const store = await freshStore();
    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(ok(payload()));

    await expect(store.fetchTradesWithRetry()).resolves.toEqual(payload());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry statuses that would fail identically (404)', async () => {
    const store = await freshStore();
    fetchMock.mockResolvedValue(status(404));

    await expect(store.fetchTradesWithRetry()).rejects.toThrow('unexpected status 404');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxAttempts on persistent 503', async () => {
    const store = await freshStore();
    fetchMock.mockResolvedValue(status(503));

    await expect(store.fetchTradesWithRetry()).rejects.toThrow('503');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('refresh', () => {
  it('builds a snapshot with precomputed aggregates', async () => {
    const store = await freshStore();
    fetchMock.mockResolvedValue(ok(payload([sampleTrade], 999)));

    await store.refresh();
    const snap = store.getSnapshot();
    expect(snap?.generatedAt).toBe(999);
    expect(snap?.aggregates.summary.netPnl).toBe(8); // (110-100)*1 - 2
    expect(store.getMeta()).toMatchObject({ hasData: true, totalTrades: 1, lastError: null });
  });

  it('keeps the previous snapshot and records the error when a refresh fails', async () => {
    const store = await freshStore();
    fetchMock.mockResolvedValueOnce(ok(payload([sampleTrade], 111)));
    await store.refresh();

    fetchMock.mockResolvedValue(status(503));
    await store.refresh(); // never rejects by design

    expect(store.getSnapshot()?.generatedAt).toBe(111); // old data still served
    expect(store.getMeta().lastError?.message).toContain('503');
  });

  it('single-flights concurrent refreshes into one upstream fetch', async () => {
    const store = await freshStore();
    let release!: (value: unknown) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => (release = resolve)));

    const first = store.refresh();
    const second = store.refresh();
    expect(store.getMeta().refreshing).toBe(true);

    release(ok(payload([sampleTrade])));
    await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.getMeta()).toMatchObject({ refreshing: false, hasData: true });
  });
});
