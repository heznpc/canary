import { scanAll } from "@/lib/scanners";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await scanAll();
  return Response.json(data);
}
