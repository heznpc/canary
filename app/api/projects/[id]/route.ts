import { projects } from "@/lib/projects";
import { scanProject } from "@/lib/scanners";

export const dynamic = "force-dynamic";

// Project IDs: alphanumeric, hyphens, underscores, 1-64 chars
const VALID_ID = /^[a-zA-Z0-9_-]{1,64}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!VALID_ID.test(id)) {
    return Response.json(
      { error: "Invalid project ID format" },
      { status: 400 },
    );
  }

  const project = projects.find((p) => p.id === id);

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const health = await scanProject(project);
  return Response.json(health);
}
