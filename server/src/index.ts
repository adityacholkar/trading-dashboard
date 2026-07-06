import express from 'express';
import { config } from './config.js';
import { getMeta, refresh } from './services/tradesStore.js';
import { apiRouter } from './routes/api.js';

const app = express();

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});
app.get('/api/meta', (_req, res) => {
  res.json(getMeta());
});

app.post('/api/refresh', (_req, res) => {
  const alreadyRefreshing = getMeta().refreshing;
  void refresh(); // start it, don't wait for it
  res.status(202).json({ refreshing: true, joinedExisting: alreadyRefreshing });
});

app.use('/api', apiRouter);

app.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port}`);
  void refresh(); // fetch the day's data on boot
  setInterval(() => void refresh(), config.refreshInterval).unref();
});
