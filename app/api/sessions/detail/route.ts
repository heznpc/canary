import { headers } from "next/headers";

import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { parseClaudeDetail } from "@/lib/sessions/claude";
import { parseCodexDetail } from "@/lib/sessions/codex";
import { redactDetail } from "@/lib/sessions/redact";
import { codexSessionsRoot, isAllowedTranscriptPath, sessionsEnabled } from "@/lib/sessions/scan";

export const dynamic = "force-dynamic";

const DETAIL_RATE_LIMIT = 60;
const DETAIL_WINDOW_MS = 60_000;

export async function GET(request: Request) {
  if (!sessionsEnabled()) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const limited = rateLimit(ip, DETAIL_RATE_LIMIT, DETAIL_WINDOW_MS);
  if (!limited.allowed) {
    return Response.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } },
    );
  }

  const url = new URL(request.url);
  const path = url.searchParams.get("path") ?? "";
  if (!isAllowedTranscriptPath(path)) {
    return Response.json({ error: "Path outside transcript stores" }, { status: 400 });
  }

  try {
    const detail = path.startsWith(codexSessionsRoot())
      ? await parseCodexDetail(path)
      : await parseClaudeDetail(path);
    const redacted = url.searchParams.get("redact") === "1";
    return Response.json(redacted ? redactDetail(detail) : detail);
  } catch (err) {
    logger.error("session detail route failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Failed to parse transcript" }, { status: 500 });
  }
}
