import WebSocket from 'ws';
import { config } from '../config.js';
import { createLogger } from '../logger.js';

const log = createLogger('feed');

export interface Tick {
  type: 'tick';
  seq: number;
  symbol: string;
  price: number;
  basePrice: number;
  ts: number;
}

interface WelcomeMessage {
  type: 'welcome';
  symbols: string[];
  ts: number;
}

// The one unavoidable trust boundary is the JSON.parse cast below; from there
// the 'type' discriminant narrows without further assertions. Message types we
// don't know about simply match neither branch.
type UpstreamMessage = Tick | WelcomeMessage;

type TickListener = (tick: Tick) => void;

// One upstream connection feeds every browser client (see wsRelay.ts), so
// user count never adds load on the mock server.
const latest = new Map<string, Tick>();
const listeners = new Set<TickListener>();

let ws: WebSocket | null = null;
let lastSeq = 0;
let reconnectAttempt = 0;
let idleTimer: NodeJS.Timeout | null = null;

export function onTick(listener: TickListener): void {
  listeners.add(listener);
}

/** Latest known price per symbol — sent to browser clients when they connect. */
export function getLatestPrices(): Tick[] {
  return [...latest.values()];
}

export function startPriceFeed(): void {
  connect();
}

function connect(): void {
  const url = `${config.baseURL.replace(/^http/, 'ws')}/ws`;
  log.info(`connecting to ${url}`);

  // seq restarts from 1 on every new upstream connection (verified against
  // the real server), so the stale-tick counter must reset here — otherwise
  // every tick after a reconnect would be dropped as "old".
  lastSeq = 0;
  ws = new WebSocket(url);

  // Protocol-level pings from the server are answered automatically by the
  // ws library; the idle timer below covers everything else.
  ws.on('open', () => {
    reconnectAttempt = 0;
    bumpIdleTimer();
  });

  ws.on('message', (raw) => {
    bumpIdleTimer();
    let msg: UpstreamMessage;
    try {
      msg = JSON.parse(raw.toString()) as UpstreamMessage;
    } catch {
      return;
    }
    if (msg.type === 'welcome') {
      // Subscribe to whatever the feed offers rather than hardcoding symbols.
      // Subscriptions do not survive a reconnect, so doing it here (which runs
      // on every new connection) is exactly right.
      ws?.send(JSON.stringify({ action: 'subscribe', symbols: msg.symbols }));
      log.info(`subscribing to ${msg.symbols.length} symbols`);
    } else if (msg.type === 'tick') {
      if (msg.seq <= lastSeq) return; // stale or out of order — drop
      lastSeq = msg.seq;
      latest.set(msg.symbol, msg);
      for (const listener of listeners) listener(msg);
    }
  });

  ws.on('error', (err) => {
    log.warn(`socket error: ${err.message}`);
  });

  // 'close' fires exactly once per socket (also after error or terminate),
  // so it is the single place reconnection is scheduled from.
  ws.on('close', scheduleReconnect);
}

function bumpIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    log.warn(`no messages for ${config.reconnectDelay} ms, assuming dead connection`);
    ws?.terminate();
  }, config.reconnectDelay);
  idleTimer.unref();
}

function scheduleReconnect(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  const delay = Math.min(config.reconnectDelay * 2 ** reconnectAttempt, config.reconnectDelayMax);
  reconnectAttempt++;
  log.info(`disconnected, reconnecting in ${delay} ms`);
  setTimeout(connect, delay).unref();
}
