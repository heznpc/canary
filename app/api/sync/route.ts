import { NextResponse } from "next/server";
import { scanAll } from "@/lib/scanners";
import { generateProjectsJson } from "@/lib/sync/heznpc";
import { logger } from "@/lib/logger";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = `req_${crypto.randomUUID()}`;
  logger.info("Sync request received", { requestId });

  try {
    const data = await scanAll(requestId);
    const projectsJson = generateProjectsJson(data);
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
