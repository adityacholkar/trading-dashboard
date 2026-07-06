// Console wrapper so LOG_LEVEL can control verbosity without touching call sites.
const LEVELS = ['error', 'warn', 'info'] as const;
type Level = (typeof LEVELS)[number];

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

function isLevel(value: string | undefined): value is Level {
  return (LEVELS as readonly string[]).includes(value ?? '');
}

const requested: string | undefined = process.env.LOG_LEVEL;
const threshold: number = LEVELS.indexOf(isLevel(requested) ? requested : 'info');

export function createLogger(scope: string): Logger {
  const enabled = (level: Level): boolean => LEVELS.indexOf(level) <= threshold;
  return {
    info(msg: string): void {
      if (enabled('info')) console.log(`[${scope}] ${msg}`);
    },
    warn(msg: string): void {
      if (enabled('warn')) console.warn(`[${scope}] ${msg}`);
    },
    error(msg: string): void {
      if (enabled('error')) console.error(`[${scope}] ${msg}`);
    },
  };
}
