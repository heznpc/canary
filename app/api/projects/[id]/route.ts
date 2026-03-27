import { projects } from "@/lib/projects";
import { scanProject } from "@/lib/scanners";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = projects.find((p) => p.id === id);

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const health = await scanProject(project);
  return Response.json(health);
}
