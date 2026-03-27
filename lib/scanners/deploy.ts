import type { DeployStatus } from "../types";
import type { ProjectConfig } from "../projects";

function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 5000) {
  return Promise.race([
    fetch(url, opts),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

export async function checkDeployStatus(project: ProjectConfig): Promise<DeployStatus> {
  const base: DeployStatus = {
    target: project.deployTarget,
    status: "not-deployed",
    lastChecked: new Date().toISOString(),
  };

  switch (project.deployTarget) {
    case "vercel":
      return checkVercel(project, base);
    case "npm":
      return checkNpm(project, base);
    case "github-pages":
      return checkUrl(project, base);
    case "zenodo":
      return { ...base, status: "up", url: `https://zenodo.org/search?q=${project.id}` };
    case "chrome-store":
      return { ...base, status: "up", url: "https://chromewebstore.google.com" };
    default:
      return base;
  }
}

async function checkVercel(project: ProjectConfig, base: DeployStatus): Promise<DeployStatus> {
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

async function checkUrl(project: ProjectConfig, base: DeployStatus): Promise<DeployStatus> {
  if (!project.deployUrl) return base;

  try {
    const res = await fetchWithTimeout(project.deployUrl, { method: "HEAD", redirect: "follow" });
    return { ...base, status: res.ok ? "up" : "down", url: project.deployUrl };
  } catch {
    return { ...base, status: "unknown", url: project.deployUrl };
  }
}
