import type { DeployStatus } from "../types";
import type { ProjectConfig } from "../projects";
import { fetchWithTimeout } from "./version-utils";

export async function checkDeployStatus(project: ProjectConfig): Promise<DeployStatus> {
  const base: DeployStatus = {
    target: project.deployTarget,
    status: "not-deployed",
    lastChecked: new Date().toISOString(),
  };

  switch (project.deployTarget) {
    case "vercel":
    case "github-pages":
      return checkUrlStatus(project, base);
    case "npm":
      return checkNpm(project, base);
    case "zenodo":
      return { ...base, status: "up", url: `https://zenodo.org/search?q=${project.id}` };
    case "chrome-store":
      return { ...base, status: "up", url: "https://chromewebstore.google.com" };
    default:
      return base;
  }
}

async function checkUrlStatus(project: ProjectConfig, base: DeployStatus): Promise<DeployStatus> {
  if (!project.deployUrl) return base;

  try {
    const res = await fetchWithTimeout(project.deployUrl, { method: "HEAD", redirect: "follow" });
    return { ...base, status: res.ok ? "up" : "down", url: project.deployUrl };
  } catch {
    return { ...base, status: "unknown", url: project.deployUrl };
  }
}

async function checkNpm(project: ProjectConfig, base: DeployStatus): Promise<DeployStatus> {
  if (!project.npmPackage) return base;

  try {
    const res = await fetchWithTimeout(`https://registry.npmjs.org/${project.npmPackage}/latest`);
    if (!res.ok) return { ...base, status: "down" };

    const data = await res.json();
    return {
      ...base,
      status: "up",
      version: data.version,
      url: `https://www.npmjs.com/package/${project.npmPackage}`,
    };
  } catch {
    return { ...base, status: "unknown" };
  }
}

