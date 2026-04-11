import { CircuitBreaker } from "../circuit-breaker";

/** Shared across every scanner that calls the GitHub REST API. */
export const githubBreaker = new CircuitBreaker({
  failureThreshold: 8,
  resetTimeoutMs: 60_000,
  name: "github-api",
});

/**
 * Run `fn` under the shared GitHub circuit breaker. Errors propagate to the
 * breaker so it can count failures and open the circuit — inner try/catch in
 * scanners would defeat that. The `scanner` label gets merged into any
 * failure log emitted by the breaker so we can tell which scanner blew up.
 */
export function runGuarded<T>(
  scanner: string,
  repo: string,
  fn: () => Promise<T | null>,
): Promise<T | null> {
  return githubBreaker.execute<T | null>(fn, null, { scanner, repo });
}
