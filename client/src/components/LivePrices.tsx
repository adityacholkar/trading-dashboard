import type { ReactElement } from 'react';
import type { Instrument } from '../api';
import type { LivePrice } from '../useLivePrices';
import { inr } from '../format';

interface LivePricesProps {
  instruments: Instrument[];
  prices: Record<string, LivePrice>;
}

export function LivePrices({ instruments, prices }: LivePricesProps): ReactElement {
  return (
    <div className="cards">
      {instruments.map((inst) => {
        const live: LivePrice | undefined = prices[inst.symbol];
        const change: number | null = live ? live.price - live.basePrice : null;
        const changePct: number | null =
          live && change !== null ? (change / live.basePrice) * 100 : null;
        // Direction of the *last tick*, for a subtle live movement cue.
        const dir: string =
          live?.prevPrice == null ? '' : live.price >= live.prevPrice ? 'pos' : 'neg';
        return (
          <div className="card" key={inst.symbol}>
            <div className="card-label">
              {inst.symbol} · {inst.name}
            </div>
            <div className={`card-value ${dir}`}>{live ? inr(live.price) : '—'}</div>
            {change !== null && changePct !== null && (
              <div className={`card-sub ${change >= 0 ? 'pos' : 'neg'}`}>
                {change >= 0 ? '+' : ''}
                {inr(change)} ({changePct.toFixed(2)}%) vs base
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
