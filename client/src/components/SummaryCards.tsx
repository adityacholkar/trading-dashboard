import type { ReactElement } from 'react';
import type { Summary } from '../api';
import { inr, pct } from '../format';

interface Card {
  label: string;
  value: string;
  className: string;
}

interface SummaryCardsProps {
  summary: Summary;
}

function pnlClass(x: number): string {
  return x >= 0 ? 'pos' : 'neg';
}

export function SummaryCards({ summary }: SummaryCardsProps): ReactElement {
  const cards: Card[] = [
    {
      label: 'Gross P&L (before brokerage)',
      value: inr(summary.grossPnl),
      className: pnlClass(summary.grossPnl),
    },
    {
      label: 'Net P&L (after brokerage)',
      value: inr(summary.netPnl),
      className: pnlClass(summary.netPnl),
    },
    {
      label: 'Number of trades',
      value: summary.totalTrades.toLocaleString('en-IN'),
      className: '',
    },
    { label: 'Total brokerage paid', value: inr(summary.totalBrokerage), className: '' },
    { label: 'Win rate', value: pct(summary.winRate), className: '' },
  ];
  return (
    <div className="cards">
      {cards.map((c) => (
        <div className="card" key={c.label}>
          <div className="card-label">{c.label}</div>
          <div className={`card-value ${c.className}`}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}
