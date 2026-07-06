import type { Request, RequestHandler, Response } from 'express';
import { getMeta, getSnapshot, refresh, type Snapshot } from '../services/tradesStore.js';
import { getInstruments } from '../services/instruments.js';

// Dashboard data routes share one rule: serve the precomputed snapshot
// instantly, or say "warming up" if the very first fetch hasn't landed yet.
function fromSnapshot(pick: (snap: Snapshot) => unknown): RequestHandler {
  return (_req: Request, res: Response): void => {
    const snap = getSnapshot();
    if (!snap) {
      res.status(503).json({ status: 'warming_up', lastError: getMeta().lastError });
      return;
    }
    res.json(pick(snap));
  };
}

export function health(_req: Request, res: Response): void {
  res.json({ ok: true, ts: Date.now() });
}

export function meta(_req: Request, res: Response): void {
  res.json(getMeta());
}

export const summary = fromSnapshot((snap) => snap.aggregates.summary);
export const instrumentsPerformance = fromSnapshot((snap) => snap.aggregates.byInstrument);
export const dailyPnl = fromSnapshot((snap) => snap.aggregates.dailyPnl);

export async function instruments(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await getInstruments());
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
}

// POST because it changes server state. Responds immediately (202 Accepted);
// the fetch runs in the background and the UI tracks it via /api/meta.
export function triggerRefresh(_req: Request, res: Response): void {
  const alreadyRefreshing: boolean = getMeta().refreshing;
  void refresh();
  res.status(202).json({ refreshing: true, joinedExisting: alreadyRefreshing });
}
