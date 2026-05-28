import { describe, it, expect } from "vitest";
import { withTraceMeta, W3C_TRACE_KEYS } from "../mcp/trace-meta";

describe("withTraceMeta — MCP 2026-07-28 RC W3C Trace Context propagation", () => {
  it("echoes traceparent / tracestate / baggage from incoming _meta to the reply", () => {
    const reply = withTraceMeta(
      { content: [{ type: "text", text: "ok" }] },
      {
        _meta: {
          traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
          tracestate: "vendorA=cid:abc,vendorB=other",
          baggage: "userId=42,region=apac",
        },
      },
    );
    expect((reply as { _meta?: Record<string, string> })._meta).toEqual({
      traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
      tracestate: "vendorA=cid:abc,vendorB=other",
      baggage: "userId=42,region=apac",
    });
  });

  it("returns the original object unchanged when no W3C key is present", () => {
    const original = { content: [{ type: "text", text: "ok" }] };
    const result = withTraceMeta(original, { _meta: { otherKey: "value" } });
    expect(result).toBe(original);
    expect((result as { _meta?: unknown })._meta).toBeUndefined();
  });

  it("returns the original object when extra is undefined", () => {
    const original = { content: [{ type: "text", text: "ok" }] };
    const result = withTraceMeta(original, undefined);
    expect(result).toBe(original);
  });

  it("does NOT propagate non-trace keys from incoming _meta — only the 3 W3C keys", () => {
    const reply = withTraceMeta(
      { content: [{ type: "text", text: "ok" }] },
      {
        _meta: {
          traceparent: "00-deadbeef-cafebabe-01",
          // Anything else (progressToken, custom client headers, etc.) must
          // NOT echo back, to avoid accidentally leaking session-private
          // fields through a transport the caller didn't expect.
          progressToken: "abc-123",
          secret: "do-not-echo",
        },
      },
    );
    const meta = (reply as { _meta?: Record<string, unknown> })._meta!;
    expect(Object.keys(meta)).toEqual(["traceparent"]);
    expect(meta.progressToken).toBeUndefined();
    expect(meta.secret).toBeUndefined();
  });

  it("preserves any pre-existing _meta on the reply and merges trace keys on top", () => {
    const reply = withTraceMeta(
      {
        content: [{ type: "text", text: "ok" }],
        _meta: { canaryGeneratedAt: "2026-05-29T00:00:00Z" },
      },
      { _meta: { traceparent: "00-aa-bb-01" } },
    );
    expect((reply as { _meta?: Record<string, unknown> })._meta).toEqual({
      canaryGeneratedAt: "2026-05-29T00:00:00Z",
      traceparent: "00-aa-bb-01",
    });
  });

  it("ignores incoming trace keys whose value is not a non-empty string", () => {
    const reply = withTraceMeta(
      { content: [{ type: "text", text: "ok" }] },
      {
        _meta: {
          traceparent: "",
          tracestate: 42 as unknown as string,
          baggage: null as unknown as string,
        },
      },
    );
    // All three are invalid — should behave as if no W3C keys were sent.
    expect((reply as { _meta?: unknown })._meta).toBeUndefined();
  });

  it("exports exactly the 3 W3C keys the spec locks down", () => {
    expect([...W3C_TRACE_KEYS]).toEqual(["traceparent", "tracestate", "baggage"]);
  });
});
