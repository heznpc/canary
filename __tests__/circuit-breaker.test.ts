import { describe, it, expect, beforeEach } from "vitest";
import { CircuitBreaker } from "../lib/circuit-breaker";

function makeBreaker() {
  return new CircuitBreaker({
    failureThreshold: 3,
    resetTimeoutMs: 50,
    name: "test",
  });
}

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = makeBreaker();
  });

  it("starts in the closed state", () => {
    expect(breaker.getState()).toBe("closed");
  });

  it("returns the function result on success", async () => {
    const result = await breaker.execute(async () => 42, -1);
    expect(result).toBe(42);
    expect(breaker.getState()).toBe("closed");
  });

  it("returns the fallback when the function throws", async () => {
    const result = await breaker.execute(async () => {
      throw new Error("boom");
    }, "fallback");
    expect(result).toBe("fallback");
  });

  it("opens the circuit after reaching the failure threshold", async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.execute(async () => {
        throw new Error("boom");
      }, null);
    }
    expect(breaker.getState()).toBe("open");
  });

  it("returns fallback without invoking fn while open", async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.execute(async () => { throw new Error("boom"); }, null);
    }

    let invoked = false;
    const result = await breaker.execute(async () => {
      invoked = true;
      return "ok";
    }, "fallback");

    expect(invoked).toBe(false);
    expect(result).toBe("fallback");
  });

  it("transitions through half-open and closes on success", async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.execute(async () => { throw new Error("boom"); }, null);
    }
    expect(breaker.getState()).toBe("open");

    // Wait past the reset window
    await new Promise((r) => setTimeout(r, 60));

    const result = await breaker.execute(async () => "recovered", "fallback");
    expect(result).toBe("recovered");
    expect(breaker.getState()).toBe("closed");
  });

  it("resets failure count on a successful call", async () => {
    await breaker.execute(async () => { throw new Error("boom"); }, null);
    await breaker.execute(async () => "ok", "fallback");
    // Now we can fail twice without opening (threshold = 3)
    await breaker.execute(async () => { throw new Error("boom"); }, null);
    await breaker.execute(async () => { throw new Error("boom"); }, null);
    expect(breaker.getState()).toBe("closed");
  });
});
