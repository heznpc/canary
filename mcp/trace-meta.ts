/**
 * W3C Trace Context propagation for MCP tool replies.
 *
 * MCP 2026-07-28 RC (release candidate locked 2026-05-21) standardises
 * distributed-trace propagation across the protocol via three `_meta` keys:
 * `traceparent`, `tracestate`, and `baggage` (W3C Trace Context, RFC). When
 * a host (Claude Code, Cursor CLI, Codex CLI, Gemini CLI) issues a
 * `tools/call` request carrying these keys in `_meta`, the server is
 * expected to echo them back on the reply so traces correlate through
 * `tool/call → canary scanner → downstream HTTP fetches`.
 *
 * Canary participates in the *propagation* side of this contract: we do
 * not run our own OpenTelemetry collector (that is anvil's layer, not
 * ours) and we do not synthesise spans for our internal work. We just
 * round-trip the three trace keys so an upstream Langfuse / Honeycomb /
 * OTel collector hosted by the operator can stitch our tool calls into
 * its picture of the session. Any non-trace `_meta` keys on the incoming
 * request are *not* propagated to avoid accidentally leaking private
 * fields back through a different transport.
 *
 * Reference: https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/
 */

export const W3C_TRACE_KEYS = ["traceparent", "tracestate", "baggage"] as const;

export type ToolExtra = { _meta?: Record<string, unknown> } | undefined;

export function withTraceMeta<T extends object>(result: T, extra: ToolExtra): T {
  const incoming = extra?._meta ?? {};
  const echoed: Record<string, string> = {};
  for (const key of W3C_TRACE_KEYS) {
    const v = (incoming as Record<string, unknown>)[key];
    if (typeof v === "string" && v.length > 0) echoed[key] = v;
  }
  if (Object.keys(echoed).length === 0) return result;
  const existingMeta = (result as { _meta?: Record<string, unknown> })._meta ?? {};
  return { ...result, _meta: { ...existingMeta, ...echoed } };
}
