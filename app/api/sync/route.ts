import { NextResponse } from "next/server";
import { scanAll } from "@/lib/scanners";
import { generateProjectsJson } from "@/lib/sync/heznpc";
import { syncConfig } from "@/canary.config";
import { logger } from "@/lib/logger";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = `req_${crypto.randomUUID()}`;
  logger.info("Sync request received", { requestId });

  if (!syncConfig) {
    return NextResponse.json(
      { error: "syncConfig not configured in canary.config.ts", requestId },
      { status: 503, headers: { "X-Request-Id": requestId } },
    );
  }

  try {
    const data = await scanAll(requestId);
    const projectsJson = generateProjectsJson(data, syncConfig);
    logger.info("Sync complete", { requestId });
    return new NextResponse(projectsJson, {
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      },
    });
  } catch {
    logger.error("Sync failed", { requestId });
    return NextResponse.json(
      { error: "Sync failed", requestId },
      { status: 500, headers: { "X-Request-Id": requestId } },
    );
  }
}
