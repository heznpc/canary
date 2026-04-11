import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkDeployStatus } from "../lib/scanners/deploy";
import type { ProjectConfig } from "../lib/projects";

function project(overrides: Partial<ProjectConfig>): ProjectConfig {
  return {
    id: "test",
    name: "Test",
    description: "test",
    tag: "active",
    stack: [],
    deployTarget: "vercel",
    category: "app",
    ...overrides,
  };
}

describe("checkDeployStatus", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns 'not-deployed' for vercel project without deployUrl", async () => {
    const result = await checkDeployStatus(project({ deployTarget: "vercel" }));
    expect(result.status).toBe("not-deployed");
  });

  it("HEAD-probes the deploy URL for vercel projects", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const result = await checkDeployStatus(
      project({ deployTarget: "vercel", deployUrl: "https://example.com" }),
    );
    expect(result.status).toBe("up");
    expect(result.url).toBe("https://example.com");
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0];
    expect((init as RequestInit).method).toBe("HEAD");
  });

  it("reports 'down' when deploy URL returns non-OK", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 500 }));
    const result = await checkDeployStatus(
      project({ deployTarget: "vercel", deployUrl: "https://example.com" }),
    );
    expect(result.status).toBe("down");
  });

  it("reports 'unknown' when fetch throws", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("network"));
    const result = await checkDeployStatus(
      project({ deployTarget: "github-pages", deployUrl: "https://example.com" }),
    );
    expect(result.status).toBe("unknown");
  });

  it("reports 'unknown' for zenodo without a DOI", async () => {
    const result = await checkDeployStatus(project({ deployTarget: "zenodo" }));
    expect(result.status).toBe("unknown");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("verifies a zenodo DOI through doi.org", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const result = await checkDeployStatus(
      project({ deployTarget: "zenodo", zenodoDoi: "10.5281/zenodo.1234567" }),
    );
    expect(result.status).toBe("up");
    expect(result.url).toContain("doi.org/10.5281/zenodo.1234567");
  });

  it("reports 'unknown' for chrome-store without an extension ID", async () => {
    const result = await checkDeployStatus(project({ deployTarget: "chrome-store" }));
    expect(result.status).toBe("unknown");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("verifies chrome-store via the listing detail page", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const result = await checkDeployStatus(
      project({ deployTarget: "chrome-store", chromeExtensionId: "abc123" }),
    );
    expect(result.status).toBe("up");
    expect(result.url).toContain("chromewebstore.google.com/detail/abc123");
  });

  it("looks up an npm package version when checking npm deploys", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ version: "1.2.3" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await checkDeployStatus(
      project({ deployTarget: "npm", npmPackage: "left-pad" }),
    );
    expect(result.status).toBe("up");
    expect(result.version).toBe("1.2.3");
  });
});
