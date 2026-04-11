import { logger } from "./logger";

type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold: number;
  /** Time in ms to wait before transitioning from open to half-open */
  resetTimeoutMs: number;
  /** Name for logging */
  name: string;
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions) {
    this.options = options;
  }

  async execute<T>(
    fn: () => Promise<T>,
    fallback: T,
    context?: Record<string, unknown>,
  ): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime >= this.options.resetTimeoutMs) {
        this.state = "half-open";
        logger.info("Circuit breaker transitioning to half-open", {
          name: this.options.name,
        });
      } else {
        logger.warn("Circuit breaker is open, returning fallback", {
          name: this.options.name,
          ...context,
        });
        return fallback;
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      logger.error("Circuit breaker caught failure", {
        name: this.options.name,
        state: this.state,
        failureCount: this.failureCount,
        error: err instanceof Error ? err.message : String(err),
        ...context,
      });
      return fallback;
    }
  }

  private onSuccess(): void {
    if (this.state === "half-open") {
      logger.info("Circuit breaker recovered, closing", {
        name: this.options.name,
      });
    }
    this.failureCount = 0;
    this.state = "closed";
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.options.failureThreshold) {
      this.state = "open";
      logger.warn("Circuit breaker opened", {
        name: this.options.name,
        failureCount: this.failureCount,
        resetTimeoutMs: this.options.resetTimeoutMs,
      });
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}
