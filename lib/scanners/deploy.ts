import type { DeployStatus } from "../types";
import type { ProjectConfig } from "../projects";
import { fetchWithTimeout, DisallowedFetchError } from "./version-utils";
import { logger } from "../logger";

const CHROME_STORE_BASE = "https://chromewebstore.google.com/detail";
const DOI_BASE = "https://doi.org";

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
      return checkZenodo(project, base);
    case "chrome-store":
      return checkChromeStore(project, base);
    default:
      return base;
  }
}

async function checkUrlStatus(project: ProjectConfig, base: DeployStatus): Promise<DeployStatus> {
  if (!project.deployUrl) return base;
  return probeUrl(project.deployUrl, base);
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

async function checkZenodo(project: ProjectConfig, base: DeployStatus): Promise<DeployStatus> {
  if (!project.zenodoDoi) {
    return { ...base, status: "unknown" };
  }
  return probeUrl(`${DOI_BASE}/${project.zenodoDoi}`, base);
}

async function checkChromeStore(project: ProjectConfig, base: DeployStatus): Promise<DeployStatus> {
  if (!project.chromeExtensionId) {
    return { ...base, status: "unknown" };
  }
  return probeUrl(`${CHROME_STORE_BASE}/${project.chromeExtensionId}`, base);
}

async function probeUrl(url: string, base: DeployStatus): Promise<DeployStatus> {
  try {
    // deploy URLs are user-configured (Vercel apps, GitHub Pages sites,
    // arbitrary self-hosted endpoints) so the host allow-list does not
    // apply — opt in to allowAnyHost. The FORBIDDEN_HOSTS deny-list
    // (cloud metadata + private network ranges + loopback) still applies
    // as a safety floor, and redirects are now re-validated through the
    // same gate (2026-05-29 review, finding 4).
    const res = await fetchWithTimeout(url, { method: "HEAD", allowAnyHost: true });
    return { ...base, status: res.ok ? "up" : "down", url };
  } catch (err) {
    // Distinguish "canary refused to probe" from "network/deploy failure"
    // so the dashboard and the log stream can tell them apart. Operability
    // gap surfaced in the 2026-05-29 code review (finding 8) — pre-fix,
    // both collapsed to status="unknown" with the same opaque log line.
    if (err instanceof DisallowedFetchError) {
      logger.warn("deploy: probe refused (URL violates fetch policy)", {
        url,
        reason: err.reason,
      });
      return { ...base, status: "misconfigured", url };
    }
    logger.warn("deploy: probe failed (network/timeout)", {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ...base, status: "unknown", url };
  }
}
