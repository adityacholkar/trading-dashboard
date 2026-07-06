import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { refresh } from './services/tradesStore.js';
import { apiRouter } from './routes/api.js';
import { startPriceFeed } from './services/priceFeed.js';
import { attachWsRelay } from './websocket/websocketRelay.js';

const app = express();

app.use('/api', apiRouter);

// In production the built React app is served from this same server, so one
// process (and one URL) covers the whole dashboard. In dev, Vite serves the
// client and proxies /api and /ws here instead.
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const server = http.createServer(app);
attachWsRelay(server);

server.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port}`);
  void refresh(); // fetch the day's data on boot
  setInterval(() => void refresh(), config.refreshInterval).unref();
  startPriceFeed();
});
