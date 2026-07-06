import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { config } from '../config.js';
import { getLatestPrices, onTick } from '../services/priceFeed.js';

/**
 * Fans the single upstream price feed out to every connected browser.
 * Browsers connect to ws://<this server>/ws and only ever receive:
 *   { type: 'snapshot', prices: Tick[] }  — once, on connect
 *   { type: 'tick', ... }                 — live, relayed from upstream
 */
export function attachWsRelay(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Heartbeat bookkeeping: a client is alive if it answered our last ping.
  const alive = new WeakSet<WebSocket>();

  wss.on('connection', (client) => {
    alive.add(client);
    client.on('pong', () => alive.add(client));
    // Latest known prices immediately, so cards render without waiting
    // up to a tick interval for each symbol.
    client.send(JSON.stringify({ type: 'snapshot', prices: getLatestPrices() }));
  });

  onTick((tick) => {
    const data = JSON.stringify(tick);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  });

  // Ping clients periodically and drop the ones that never answered the
  // previous ping — otherwise silently gone browsers (sleep, network switch)
  // would accumulate as dead sockets we keep writing to.
  setInterval(() => {
    for (const client of wss.clients) {
      if (!alive.has(client)) {
        client.terminate();
        continue;
      }
      alive.delete(client);
      client.ping();
    }
  }, config.pingInterval).unref();
}
