// Console wrapper so LOG_LEVEL can control verbosity without touching call sites.
const LEVELS = ['error', 'warn', 'info'] as const;
type Level = (typeof LEVELS)[number];

const requested = process.env.LOG_LEVEL as Level | undefined;
const threshold = LEVELS.indexOf(requested && LEVELS.includes(requested) ? requested : 'info');

export function createLogger(scope: string) {
  const enabled = (level: Level) => LEVELS.indexOf(level) <= threshold;
  return {
    info: (msg: string) => enabled('info') && console.log(`[${scope}] ${msg}`),
    warn: (msg: string) => enabled('warn') && console.warn(`[${scope}] ${msg}`),
    error: (msg: string) => enabled('error') && console.error(`[${scope}] ${msg}`),
  };
}
