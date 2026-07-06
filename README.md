# Real-Time Trading Dashboard

**Live demo:** https://trading-dashboard-igd7.onrender.com/
*(Hosted on Render's free tier — if it has been idle, the first load takes up to a minute to wake up, then ~10 seconds fetching the trade history. The page shows a "warming up" notice while that happens.)*

A single-page dashboard showing trading performance — profit/loss summary, results per instrument, daily P&L over the past year — plus live prices that update in real time. The data source we were given is deliberately slow and unreliable; the whole point of the backend is that the person looking at the dashboard never feels that.

## The short version

Four ideas carry the whole design:

1. **Fetch the heavy data once, then answer everything from our own copy.** The server downloads the full trade history when it starts (and when you press Refresh) and keeps it in memory. Every dashboard request is answered from that copy instantly — the slow source is never in the path of a page load.
2. **Do the math once, not on every request.** The moment the trade history arrives, the server calculates everything the dashboard shows — summary totals, per-instrument results, daily P&L — in one pass. Requests just pick up ready-made answers.
3. **When a fetch fails, keep showing the data we already have.** Failed downloads are retried a few times; if they still fail, the dashboard keeps showing the previous data with a clearly visible note saying so. The page never goes blank because the source had a bad moment.
4. **One shared connection to the live price feed.** The server holds a single connection to the price feed and passes ticks along to every open browser tab. A hundred viewers still means only one connection to the source, and if anything drops — feed, server, or browser — it reconnects on its own.

The rest of this document is the detail behind those four points.

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

Open http://localhost:5173. During development, Vite forwards `/api` and `/ws` calls to the backend, so the client code uses the same relative URLs it uses in production.

**Tests** (`cd server && npm test`) cover the two places where getting it wrong would matter most: the P&L calculations ([aggregate.test.ts](server/src/domain/aggregate.test.ts)), and the download-and-retry behaviour — retry on failures worth retrying, give up fast on ones that aren't, keep the old data when a refresh fails, and make sure two simultaneous refreshes share one download ([tradesStore.test.ts](server/src/services/tradesStore.test.ts)).

**Production mode** (one process serving everything):

```bash
cd client && npm run build      # outputs client/dist
cd ../server && npm run build && npm start
```

Then open http://localhost:4000 — the server serves the built React app, the API, and the live-price feed from one port. Note the order: the client must be built first, otherwise there's nothing for the server to serve at `/`.

Environment variables (all optional): `PORT` (default 4000), `MOCK_BASE_URL` (default `https://mocktrading-silk.vercel.app`), `LOG_LEVEL` (`error` | `warn` | `info`).

## Deploying

The repo includes a [render.yaml](render.yaml) blueprint for Render: one free web service that builds the client, builds the server, and serves everything from a single URL.

**Why Render?** The backend has to be a program that stays running: it holds the trade data in memory, keeps a permanent connection open to the price feed, and streams prices to browsers. Platforms like Vercel and Netlify run your code only for the moment a request comes in, then shut it down — that model can't hold a live connection or remember anything between requests, so they're out. Of the platforms that do keep a process running, Render is the only one still offering a genuinely free plan with no credit card: Railway gives a one-time trial credit that runs out, and Fly.io charges from the start. Render also sets the `PORT` variable the server already reads, and allows WebSockets on the free plan — so the app deploys with no code changes.

**The trade-off:** on Render's free plan, the service shuts down after 15 minutes with no visitors. The next visitor waits roughly 30–60 seconds while it starts back up, plus ~10 seconds while it re-downloads the trade history. That is exactly the situation the app was built to handle — the page shows its "warming up" message during the download, and the live prices reconnect by themselves. A free monitoring service pinging `/api/health` every few minutes keeps it awake if needed.

## How the data flows

```
                     ┌────────────────────── backend (Node/Express) ──────────────────────┐
mock /api/trades ──► download with retries ──► copy kept in memory ──► pre-calculated ──► GET /api/summary
(slow, flaky, big)   (on start, on Refresh,                             dashboard numbers      /api/instruments-performance
                      once a day)                                                              /api/daily-pnl

mock /api/instruments ──► fetched once, kept ─────────────────────────────────────────────► GET /api/instruments

mock price feed ──► one connection for the ──► latest price per ──► passed on to every ──► ws://.../ws  (browser)
                    whole server, auto-         symbol               connected browser
                    reconnects if it drops
```

### Trade history (the slow, unreliable part)

1. **On start**, the server downloads `/api/trades` once. The endpoint takes several seconds and sometimes fails with a 503, so each attempt has a 30-second time limit and failures are retried up to 3 times. Between retries the server waits 1 second, then 2 — doubling each time, with a little randomness added so that many clients recovering from the same outage don't all hit the source at the same instant. Only failures where a retry could plausibly help (503, network drop, timeout, a reply cut off midway) are retried; anything else — say a 404 — would just fail the same way again, so it fails immediately.
2. The downloaded history becomes the server's **working copy**, and every number the dashboard shows is **calculated right then, in a single pass** over the trades. When a browser asks for the summary or the daily P&L, the server hands back an answer it already has — it never recalculates per request, and never touches the raw 50,000 trades again.
3. A new copy completely replaces the old one in a single step, so no request can ever see half-old, half-new data. If a refresh fails, **the previous copy stays in place** and the error is reported on `/api/meta`; the page shows it as a banner ("Last refresh failed at … — still showing data from …").
4. The data refreshes automatically once a day (it's one day's history), and **on demand** via the Refresh button. Pressing it returns "started" immediately rather than making the browser wait ten seconds; the download runs in the background while the page checks `/api/meta` every couple of seconds and reloads the numbers when it finishes. If several people press Refresh at once, they all share one download — the source is never asked twice for the same thing.
5. If someone opens the page before the very first download has finished, the API replies "warming up", and the page shows a notice and simply tries again in a moment.

### Live prices (the frequent part)

1. The backend opens **one** connection to the mock price feed, no matter how many browsers are viewing the dashboard — extra viewers never add load on the source.
2. When the feed says hello, it lists the available symbols, and the server subscribes to all of them — nothing is hard-coded. Subscriptions don't survive a reconnect, but since this happens on every new connection, reconnects re-subscribe automatically.
3. Every price message carries a sequence number that only ever goes up. Anything that arrives late or out of order is simply dropped, so a price can never briefly jump backwards. (The feed restarts its numbering on every new connection, so the server resets its counter when it reconnects.)
4. If the feed goes silent for 15 seconds or the connection drops, the server reconnects — waiting 1 second the first time and doubling up to a maximum of 30 seconds between attempts, so a dead feed isn't bombarded.
5. Browsers connect to the backend's own `/ws` feed. The first thing a newly opened tab receives is the **latest known price for every symbol**, so the cards fill in immediately instead of waiting for the next tick; after that, prices stream in live. The server periodically checks that each browser is still there and drops ones that have silently gone away, and the browser side reconnects by itself if the server restarts.

## Main decisions

- **Everything in memory, no database.** The dataset is one day's history — about 50,000 rows, a few megabytes — and the source regenerates it fresh on every download, so there is nothing worth saving to disk. Keeping it in memory makes reads instant and the system simple. If the server restarts, it re-downloads — which is the same work a database version would do on its daily refresh anyway. (If the data had to survive restarts without a re-download, or outgrew memory, SQLite would be the next step — it's a single file inside the app with no separate database server to install, run, or pay for, which fits the one-process deployment here. Something like Postgres only earns its extra moving parts when several servers need to share the same data, which this project doesn't.)
- **Calculate when data arrives, not when it's asked for.** All dashboard numbers are computed once per download. Serving a request is then just returning a stored answer, so the dashboard stays equally fast whether one person or a hundred are looking at it.
- **Refresh runs in the background.** A refresh can take ten seconds or more, or fail and retry. Instead of holding the browser's request open all that time, the server says "started" straight away and the page checks back until it's done. The button honestly shows "Refreshing…", nothing hangs, and simultaneous refreshes collapse into one download.
- **Old data beats no data.** A failed refresh never empties the dashboard — the previous numbers stay up, with a visible banner saying when they're from and that the last attempt failed. Showing slightly old data with a label is far more useful than showing an error page.
- **One feed connection, shared by everyone.** The server is the only thing that talks to the price feed; browsers get their prices from the server. New tabs get an instant snapshot of the latest prices rather than starting empty.
- **One deployment, one URL.** The backend must be a long-running process anyway (memory, live connections), so having it also serve the built frontend costs nothing and keeps everything on one address — no cross-site permissions to configure, no separate frontend host that can be down on its own, and the "working URL" is a single link. Splitting the frontend onto a CDN makes sense at high traffic or with separate teams; neither applies here.
- **Money handled carefully.** Values are plain rupees with two decimals. Totals are added up at full precision and rounded only in the final answer, so tiny rounding differences can't accumulate across 50,000 trades.
- **The table sorts in the browser.** It has ~10 rows; flipping the sort order locally is instant and doesn't need a server round trip.
- **Plain CSS, minimal frontend.** The brief says looks aren't judged, so the effort went into the backend and the data path. The only chart library is Recharts, for the daily P&L bars.

## Project layout

```
server/
  src/
    index.ts                   Express app, serves the built frontend, startup sequence
    config.ts                  All tunable numbers (timeouts, retries, intervals) in one place
    routes/api.ts              API routes
    controllers/dashboardController.ts   Thin request handlers over the stored data
    services/tradesStore.ts    Download with retries, shared refresh, the in-memory copy
    services/instruments.ts    Instrument list, fetched once and kept
    services/priceFeed.ts      Connection to the mock price feed (subscribe, drop stale ticks, reconnect)
    websocket/websocketRelay.ts  Streams prices to browsers, drops dead connections
    domain/aggregate.ts        One-pass calculation of all dashboard numbers
client/
  src/
    App.tsx                    Page layout, refresh flow, status banners
    api.ts                     Typed API client
    useLivePrices.ts           Live-price connection with automatic reconnect
    components/                SummaryCards, InstrumentTable, DailyPnlChart, LivePrices
```

## API surface (backend)

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Quick "is the server up" check |
| `GET /api/meta` | Data status: when it was last updated, whether a refresh is running, last error |
| `GET /api/summary` | Gross/net P&L, trade count, brokerage, win rate |
| `GET /api/instruments-performance` | Per-symbol trades, quantity, net P&L (sorted by net P&L) |
| `GET /api/daily-pnl` | Net P&L per day for the past year |
| `GET /api/instruments` | Instrument list |
| `POST /api/refresh` | Start a background re-download; replies immediately. POST rather than GET because it changes server state — GET is reserved for reads that are always safe to repeat, and this one triggers real work and replaces the stored data |
| `WS /ws` | Live prices: latest prices on connect, then updates as they happen |
