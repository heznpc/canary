import { NextResponse } from "next/server";
import { scanAll } from "@/lib/scanners";
import { generateProjectsJson } from "@/lib/sync/heznpc";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await scanAll();
    const projectsJson = generateProjectsJson(data);
    return new NextResponse(projectsJson, {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
