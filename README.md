# Real-Time Trading Dashboard

A single-page dashboard showing trading performance (P&L summary, per-instrument breakdown, daily P&L for the past year) plus live prices streaming over WebSocket. A Node.js backend sits between the browser and the slow/flaky mock endpoint so the UI stays fast even when the upstream isn't.

## Running locally

Prerequisites: Node.js 20+ (uses the built-in `fetch`).

```bash
# 1. Install dependencies
cd server && npm install
cd ../client && npm install

# 2. Start the backend (terminal 1)
cd server && npm run dev        # http://localhost:4000

# 3. Start the frontend (terminal 2)
cd client && npm run dev        # http://localhost:5173
```

Open http://localhost:5173. The Vite dev server proxies `/api` and `/ws` to the backend, so the client always uses relative URLs.

**Tests** (`cd server && npm test`) cover the two pieces where correctness matters most: the aggregation math ([aggregate.test.ts](server/src/domain/aggregate.test.ts)) and the fetch/retry/snapshot behavior — retry on 503 and network errors, fail fast on non-retryable statuses, keep the previous snapshot when a refresh fails, single-flight concurrent refreshes ([tradesStore.test.ts](server/src/services/tradesStore.test.ts)).

**Production mode** (single process serving everything):

```bash
cd client && npm run build      # outputs client/dist
cd ../server && npm run build && npm start
```

Then open http://localhost:4000 — Express serves the built React app, the API, and the WebSocket relay from one port. Deployment works the same way: build the client, then run the server on any Node host that supports long-lived processes (Render, Railway, Fly.io — WebSockets rule out serverless). One service, one URL. The reasoning is under [Main decisions](#main-decisions); just note that the client build must run before the server starts, or there's no `client/dist` to serve.

Environment variables (all optional): `PORT` (default 4000), `MOCK_BASE_URL` (default `https://mocktrading-silk.vercel.app`), `LOG_LEVEL` (`error` | `warn` | `info`).

## Deploying

The repo includes a [render.yaml](render.yaml) blueprint for Render: one free web service that builds the client, builds the server, and serves everything from a single URL.

**Why Render?** The backend needs a host that runs a persistent Node process: it holds the trades snapshot in memory, keeps a long-lived WebSocket open to the mock feed, and serves its own WebSocket relay to browsers. That rules out serverless platforms (Vercel, Netlify) outright — functions can't hold WebSocket connections or in-memory state between invocations. Among the hosts that do run persistent processes, Render is the only one left with a genuinely free tier (no credit card): Railway offers a one-time trial credit that runs out, and Fly.io is pay-as-you-go. Render also injects `PORT` (which the server already reads) and supports WebSockets on the free plan, so the app deploys with zero code changes.

**The trade-off:** Render's free tier spins the service down after 15 idle minutes; the first visit after that takes ~30–60 s to cold-start plus ~10 s while the server refetches the trade history. This is the failure mode the app was already built for — the UI shows its "warming up" banner during the refetch, and the live-price socket reconnects automatically once the relay is back. A free uptime monitor pinging `/api/health` keeps the service warm if needed.

## How the data flows

```
                        ┌──────────────────────── backend (Node/Express) ───────────────────────┐
mock /api/trades  ──►  fetch w/ retry+backoff ──► in-memory snapshot ──► precomputed aggregates ──► GET /api/summary
(slow, flaky, big)      (on boot, on refresh,      (trades + fetchedAt)   (summary, by-instrument,     /api/instruments-performance
                         every 24h)                                        daily P&L)                   /api/daily-pnl

mock /api/instruments ──► cached once ──────────────────────────────────────────────────────────► GET /api/instruments

mock WebSocket feed ──► single upstream connection ──► latest-price map ──► fan-out relay ──────► ws://.../ws  (browser)
(one per server,        (auto-subscribe on welcome,     (per symbol)         (snapshot on connect,
 not per user)           drop stale seq, reconnect       	                   then live ticks)
                         with backoff)
```

### Trade history (the slow part)

1. **On boot**, the server fetches `/api/trades` once. Because the endpoint is slow and sometimes returns 503, the fetch has a 30 s timeout and retries up to 3 times with exponential backoff plus jitter. Only retryable failures (503, network error, timeout, truncated body) are retried; anything else fails fast.
2. The response is stored as an **in-memory snapshot**, and all dashboard aggregates — summary cards, per-instrument table, daily P&L — are **computed once, in a single pass**, at snapshot time. Request handlers never touch the raw 50,000 trades; they return precomputed results instantly.
3. The new snapshot is built completely and then swapped in with one assignment, so no request can ever see half-updated data. If a refresh fails, the **previous snapshot stays in place** and the error is exposed via `/api/meta`, which the UI shows as a banner ("Last refresh failed at … — still showing data from …").
4. The snapshot is refreshed automatically every 24 hours (it's one day's data), and **on demand** via the Refresh button: `POST /api/refresh` returns `202 Accepted` immediately, the fetch runs in the background, and the client polls `/api/meta` until `refreshing` flips to false, then reloads the aggregates. Concurrent refresh requests are single-flighted — they join the in-progress fetch instead of hammering the upstream.
5. If the browser loads before the very first fetch lands, data routes return `503 { status: "warming_up" }` and the UI shows a "first load" notice and retries.

### Live prices (the frequent part)

1. The backend opens **one** WebSocket connection to the mock feed, regardless of how many browsers are open — user count never adds load on the mock server.
2. On the upstream `welcome` message it subscribes to every advertised symbol (nothing hardcoded). Subscriptions don't survive a reconnect, so subscribing in the welcome handler covers that automatically.
3. Ticks with a stale or out-of-order `seq` are dropped. The seq counter resets on reconnect because the upstream restarts it per connection.
4. If the upstream goes quiet for 15 s or drops, the backend reconnects with exponential backoff (1 s → 30 s cap).
5. Browsers connect to the backend's own `/ws` relay. On connect they immediately get a **snapshot of the latest known price per symbol** (so cards render without waiting for the next tick), then live ticks as they arrive. The relay pings clients periodically and drops ones that stop responding; the browser hook reconnects with capped backoff if the backend restarts.

## Main decisions

- **In-memory store, no database.** The dataset is one day's trade history (~50k rows, a few MB) that's regenerated fresh on every upstream fetch — there's nothing durable worth persisting. Holding the snapshot in memory keeps reads instant and the whole system simple. If the server restarts it just refetches, which is the same work a database-backed version would do anyway on its daily refresh. (If the history needed to survive restarts without refetching, or grew past memory, SQLite would be the next step.)
- **Aggregate at write time, not read time.** All numbers the dashboard needs are computed once per refresh in a single O(n) pass. API responses are O(1) lookups of precomputed objects, so the dashboard is fast no matter how many clients hit it.
- **Async refresh with polling instead of a long-held request.** A refresh can take ~10 s (or fail and retry). Returning `202` immediately and letting the UI poll `/api/meta` means no request hangs for that long, the button state is honest, and multiple users pressing refresh share one upstream fetch.
- **Keep stale data on failure.** A failed refresh never blanks the dashboard — the previous snapshot is served with a visible error banner. Stale-but-labelled beats empty.
- **One upstream WebSocket, fanned out.** The relay decouples browser connections from the mock feed and gives new tabs an instant price snapshot from the latest-price cache.
- **Single deployment: Express serves the built frontend.** The backend needs a long-running process anyway — it holds the snapshot in memory, keeps a persistent WebSocket to the mock feed, and relays ticks to browsers — so serverless is out, and serving a folder of static files from that same process costs nothing. It also keeps everything same-origin: the client uses relative `/api` URLs and builds its WebSocket URL from `location.host`, so there's no CORS, no API-base-URL env var, and no separate frontend host that can be down independently. Splitting frontend onto a CDN pays off with heavy traffic or separate release cadences; neither applies here.
- **Money as floats, rounded at the edges.** Values are plain rupees with 2 decimals. Sums are accumulated at full precision and rounded only in API responses, so rounding error never compounds across 50k trades.
- **Client sorts the instrument table.** It's ~10 rows; a sort toggle in the browser beats an API round trip.
- **Plain CSS, minimal frontend.** The brief says looks aren't judged — effort went into the backend and the data path. The only chart dependency is Recharts for the daily P&L bars.

## Project layout

```
server/
  src/
    index.ts                   Express app, static serving, boot sequence
    config.ts                  All tunables (timeouts, retries, intervals) in one place
    routes/api.ts              API routes
    controllers/dashboardController.ts   Thin handlers over the snapshot
    services/tradesStore.ts    Fetch w/ retry, single-flight refresh, snapshot
    services/instruments.ts    Cached instrument list
    services/priceFeed.ts      Upstream WebSocket client (subscribe, dedupe, reconnect)
    websocket/websocketRelay.ts  Fan-out relay to browsers w/ heartbeat
    domain/aggregate.ts        Single-pass aggregation of all dashboard numbers
client/
  src/
    App.tsx                    Page layout, refresh flow, status banners
    api.ts                     Typed API client
    useLivePrices.ts           WebSocket hook w/ reconnect
    components/                SummaryCards, InstrumentTable, DailyPnlChart, LivePrices
```

## API surface (backend)

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Liveness check |
| `GET /api/meta` | Snapshot status: last updated, refreshing flag, last error |
| `GET /api/summary` | Gross/net P&L, trade count, brokerage, win rate |
| `GET /api/instruments-performance` | Per-symbol trades, quantity, net P&L (sorted by net P&L) |
| `GET /api/daily-pnl` | Net P&L per day for the past year |
| `GET /api/instruments` | Instrument list (cached from upstream) |
| `POST /api/refresh` | Trigger a background refetch; returns 202 immediately |
| `WS /ws` | Live prices: snapshot on connect, then ticks |
