/**
 * Agent Logger
 * 
 * Provides structured logging for agent execution.
 * Supports different log levels and debug mode.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface AgentLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  getEntries(): LogEntry[];
}

/**
 * Create a logger instance
 */
export function createLogger(debug: boolean = false): AgentLogger {
  const entries: LogEntry[] = [];
  
  const log = (level: LogLevel, message: string, data?: Record<string, unknown>) => {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      data,
    };
    
    entries.push(entry);
    
    // Only output debug logs if debug mode is enabled
    if (level === "debug" && !debug) {
      return;
    }
    
    const prefix = `[AGENT:${level.toUpperCase()}]`;
    const dataStr = data ? ` ${JSON.stringify(data)}` : "";
    
    switch (level) {
      case "debug":
        console.debug(`${prefix} ${message}${dataStr}`);
        break;
      case "info":
        console.info(`${prefix} ${message}${dataStr}`);
        break;
      case "warn":
        console.warn(`${prefix} ${message}${dataStr}`);
        break;
      case "error":
        console.error(`${prefix} ${message}${dataStr}`);
        break;
    }
  };
  
  return {
    debug: (message, data) => log("debug", message, data),
    info: (message, data) => log("info", message, data),
    warn: (message, data) => log("warn", message, data),
    error: (message, data) => log("error", message, data),
    getEntries: () => [...entries],
  };
}

/**
 * Create a silent logger that doesn't output anything
 */
export function createSilentLogger(): AgentLogger {
  const entries: LogEntry[] = [];
  
  const log = (level: LogLevel, message: string, data?: Record<string, unknown>) => {
    entries.push({
      level,
      message,
      timestamp: new Date().toISOString(),
      data,
    });
  };
  
  return {
    debug: (message, data) => log("debug", message, data),
    info: (message, data) => log("info", message, data),
    warn: (message, data) => log("warn", message, data),
    error: (message, data) => log("error", message, data),
    getEntries: () => [...entries],
  };
}

/**
 * Format log entries as a string for debugging
 */
export function formatLogEntries(entries: LogEntry[]): string {
  return entries
    .map((entry) => {
      const dataStr = entry.data ? ` | ${JSON.stringify(entry.data)}` : "";
      return `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}${dataStr}`;
    })
    .join("\n");
}
