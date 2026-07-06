import { useMemo, useState, type ReactElement } from 'react';
import type { InstrumentRow } from '../api';
import { inr } from '../format';

type SortDir = 'desc' | 'asc';

interface InstrumentTableProps {
  rows: InstrumentRow[];
}

export function InstrumentTable({ rows }: InstrumentTableProps): ReactElement {
  const [dir, setDir] = useState<SortDir>('desc');

  // 10 rows — sorting belongs in the browser, not in an API round trip.
  const sorted: InstrumentRow[] = useMemo(
    () => [...rows].sort((a, b) => (dir === 'desc' ? b.netPnl - a.netPnl : a.netPnl - b.netPnl)),
    [rows, dir],
  );

  return (
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Trades</th>
          <th>Total quantity</th>
          <th>
            <button className="sort" onClick={() => setDir(dir === 'desc' ? 'asc' : 'desc')}>
              Net P&L {dir === 'desc' ? '▼' : '▲'}
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.symbol}>
            <td>{r.symbol}</td>
            <td>{r.trades.toLocaleString('en-IN')}</td>
            <td>{r.totalQuantity.toLocaleString('en-IN')}</td>
            <td className={r.netPnl >= 0 ? 'pos' : 'neg'}>{inr(r.netPnl)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
