import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The logger reads LOG_LEVEL at module-load time, so each test isolates by
 * resetting modules and re-importing after setting the env.
 */

async function loadLogger(level?: string) {
  vi.resetModules();
  const prev = process.env.LOG_LEVEL;
  if (level === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = level;
  try {
    const mod = await import("../lib/logger");
    return mod.logger;
  } finally {
    if (prev === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = prev;
  }
}

describe("logger LOG_LEVEL filter", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it("LOG_LEVEL=error suppresses info and warn", async () => {
    const logger = await loadLogger("error");
    logger.info("a");
    logger.warn("b");
    logger.error("c");
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it("LOG_LEVEL=debug emits everything", async () => {
    const logger = await loadLogger("debug");
    logger.debug("a");
    logger.info("b");
    logger.warn("c");
    logger.error("d");
    expect(debugSpy).toHaveBeenCalledOnce();
    expect(infoSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it("LOG_LEVEL=silent suppresses everything", async () => {
    const logger = await loadLogger("silent");
    logger.debug("a");
    logger.info("b");
    logger.warn("c");
    logger.error("d");
    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("emitted lines are JSON with level, message, timestamp, and context", async () => {
    const logger = await loadLogger("debug");
    logger.error("oops", { requestId: "abc" });
    expect(errorSpy).toHaveBeenCalledOnce();
    const line = errorSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe("error");
    expect(parsed.message).toBe("oops");
    expect(parsed.context).toEqual({ requestId: "abc" });
    expect(typeof parsed.timestamp).toBe("string");
  });
});
