type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

interface LogEntry {
  level: Exclude<LogLevel, "silent">;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

function resolveMinLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  if (raw && raw in LEVEL_RANK) return raw as LogLevel;
  // Default: quiet during tests so the suite output stays readable
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return "warn";
  return "info";
}

const minLevel = resolveMinLevel();
const minRank = LEVEL_RANK[minLevel];

function shouldLog(level: Exclude<LogLevel, "silent">): boolean {
  return LEVEL_RANK[level] >= minRank;
}

function emit(level: Exclude<LogLevel, "silent">, message: string, context?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
  };
  if (context) {
    entry.context = context;
  }

  const line = JSON.stringify(entry);

  switch (level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "debug":
      console.debug(line);
      break;
    default:
      console.log(line);
  }
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>): void {
    emit("debug", message, context);
  },
  info(message: string, context?: Record<string, unknown>): void {
    emit("info", message, context);
  },
  warn(message: string, context?: Record<string, unknown>): void {
    emit("warn", message, context);
  },
  error(message: string, context?: Record<string, unknown>): void {
    emit("error", message, context);
  },
};
