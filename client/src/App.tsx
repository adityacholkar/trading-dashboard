import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  api,
  WarmingUpError,
  type DailyPnlPoint,
  type Instrument,
  type InstrumentRow,
  type Meta,
  type Summary,
} from './api';
import { timeOf } from './format';
import { useLivePrices } from './useLivePrices';
import { SummaryCards } from './components/SummaryCards';
import { InstrumentTable } from './components/InstrumentTable';
import { DailyPnlChart } from './components/DailyPnlChart';
import { LivePrices } from './components/LivePrices';

interface DashboardData {
  summary: Summary;
  byInstrument: InstrumentRow[];
  dailyPnl: DailyPnlPoint[];
}

function App(): ReactElement {
  const [data, setData] = useState<DashboardData | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [warmingUp, setWarmingUp] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pollTimer = useRef<number | undefined>(undefined);
  const { prices, connected } = useLivePrices();

  const loadDashboard = useCallback(async () => {
    try {
      const [summary, byInstrument, dailyPnl, m] = await Promise.all([
        api.summary(),
        api.instrumentsPerformance(),
        api.dailyPnl(),
        api.meta(),
      ]);
      setData({ summary, byInstrument, dailyPnl });
      setMeta(m);
      setWarmingUp(false);
      setLoadError(null);
    } catch (err) {
      if (err instanceof WarmingUpError) {
        // Backend just booted and is still fetching its first snapshot.
        setWarmingUp(true);
        window.setTimeout(() => void loadDashboard(), 2000);
      } else {
        setLoadError((err as Error).message);
      }
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
    api
      .instruments()
      .then(setInstruments)
      .catch(() => setInstruments([]));
    return () => window.clearInterval(pollTimer.current);
  }, [loadDashboard]);

  async function handleRefresh(): Promise<void> {
    setRefreshing(true);
    await api.refresh();
    // The fetch runs server-side in the background; poll /api/meta until it
    // finishes, then pull the rebuilt aggregates.
    pollTimer.current = window.setInterval(async () => {
      const m = await api.meta();
      setMeta(m);
      if (!m.refreshing) {
        window.clearInterval(pollTimer.current);
        setRefreshing(false);
        await loadDashboard();
      }
    }, 2000);
  }

  return (
    <main>
      <header>
        <h1>Trading Dashboard</h1>
        <div className="status-bar">
          <button onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh data'}
          </button>
          {meta?.lastUpdated && <span>Data as of {timeOf(meta.lastUpdated)}</span>}
          <span className={connected ? 'pos' : 'muted'}>
            {connected ? '● live prices connected' : '○ live prices reconnecting…'}
          </span>
        </div>
        {meta?.lastError && (
          <p className="banner error">
            Last refresh failed at {timeOf(meta.lastError.at)} ({meta.lastError.message})
            {meta.lastUpdated && ` — still showing data from ${timeOf(meta.lastUpdated)}`}
          </p>
        )}
        {warmingUp && (
          <p className="banner">
            First load: the server is fetching the trade history from the source (~10 s)…
          </p>
        )}
        {loadError && <p className="banner error">Failed to load dashboard: {loadError}</p>}
      </header>

      {data && (
        <>
          <section>
            <h2>1. Overall performance</h2>
            <SummaryCards summary={data.summary} />
          </section>

          <section>
            <h2>2. Performance by instrument</h2>
            <InstrumentTable rows={data.byInstrument} />
          </section>

          <section>
            <h2>3. Daily P&L (past year)</h2>
            <DailyPnlChart data={data.dailyPnl} />
          </section>
        </>
      )}

      <section>
        <h2>4. Live prices</h2>
        <LivePrices instruments={instruments} prices={prices} />
      </section>
    </main>
  );
}

export default App;
