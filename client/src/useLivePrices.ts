import { useEffect, useState } from 'react';

export interface LivePrice {
  price: number;
  basePrice: number;
  prevPrice: number | null;
  ts: number;
}

interface TickMessage {
  type: 'tick';
  symbol: string;
  price: number;
  basePrice: number;
  ts: number;
}

type RelayMessage = TickMessage | { type: 'snapshot'; prices: TickMessage[] };

/**
 * Connects to our backend's WebSocket relay. The first message is a snapshot
 * of the latest known prices, then individual ticks stream in. Reconnects
 * with capped backoff if the backend restarts or the network blips.
 */
export interface UseLivePricesResult {
  prices: Record<string, LivePrice>;
  connected: boolean;
}

export function useLivePrices(): UseLivePricesResult {
  const [prices, setPrices] = useState<Record<string, LivePrice>>({});
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let attempt = 0;
    let unmounted = false;
    let reconnectTimer: number | undefined;

    const apply = (t: TickMessage): void =>
      setPrices((prev) => ({
        ...prev,
        [t.symbol]: {
          price: t.price,
          basePrice: t.basePrice,
          prevPrice: prev[t.symbol]?.price ?? null,
          ts: t.ts,
        },
      }));

    function connect(): void {
      const proto: 'wss' | 'ws' = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
      };
      ws.onmessage = (e: MessageEvent<string>) => {
        const msg = JSON.parse(e.data) as RelayMessage;
        if (msg.type === 'snapshot') msg.prices.forEach(apply);
        else if (msg.type === 'tick') apply(msg);
      };
      ws.onclose = () => {
        setConnected(false);
        if (unmounted) return;
        const delay = Math.min(1000 * 2 ** attempt, 15_000);
        attempt++;
        reconnectTimer = window.setTimeout(connect, delay);
      };
    }

    connect();
    return () => {
      unmounted = true;
      window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  return { prices, connected };
}
