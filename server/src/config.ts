export const config = {
  // The mock server URL
  baseUrl: process.env.MOCK_BASE_URL ?? 'https://mocktrading-silk.vercel.app',

  // Timeout for mock-api requests
  requestTimeout: 30000, // in milliseconds (30 seconds)

  /* Retry failed requests: up to 3 attempts, waiting 1s, then 2s between them. 
     Each wait is shifted by a random amount (up to 30% shorter or longer).
     The randomness stops many clients retrying at the same instant.
  */
  maxAttempts: 3,
  retryDelay: 1000,
  retryJitter: 0.3, // fraction of the delay

  // Re-fetch the trades snapshot once a day.
  refreshInterval: 24 * 60 * 60 * 1000,

  /* Price feed: if no ticks arrive for this long, treat the connection
     as dead and reconnect (delay doubles from 1s, capped at 30s).
  */
  idleTimeout: 15000,
  reconnectDelay: 1000,
  reconnectDelayMax: 30000,

  // Ping our own browser clients this often; drop ones that don't respond.
  pingInterval: 30000,

  port: Number(process.env.PORT ?? 4000),
};
