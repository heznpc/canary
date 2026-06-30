import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildVulnQueries,
  countVulnerabilities,
  extractConcreteVersion,
  extractNpmLockVersions,
  type VulnQuery,
} from "../lib/scanners/vulnerabilities";

describe("extractConcreteVersion", () => {
  it("strips caret prefix", () => {
    expect(extractConcreteVersion("^1.2.3")).toBe("1.2.3");
  });

  it("strips tilde prefix", () => {
    expect(extractConcreteVersion("~2.0.0")).toBe("2.0.0");
  });

  it("strips comparison operators", () => {
    expect(extractConcreteVersion(">=2.0.0")).toBe("2.0.0");
    expect(extractConcreteVersion(">1.0.0")).toBe("1.0.0");
  });

  it("preserves prerelease and build metadata", () => {
    expect(extractConcreteVersion("1.0.0-beta.1")).toBe("1.0.0-beta.1");
    expect(extractConcreteVersion("3.4.5+build.7")).toBe("3.4.5+build.7");
  });

  it("returns null for wildcard specs", () => {
    expect(extractConcreteVersion("*")).toBeNull();
  });

  it("returns null for git specs", () => {
    expect(extractConcreteVersion("git+https://github.com/foo/bar.git")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(extractConcreteVersion("")).toBeNull();
  });

  it("trims trailing range tokens", () => {
    expect(extractConcreteVersion(">=1.0.0 <2.0.0")).toBe("1.0.0");
  });
});

describe("npm lockfile vulnerability queries", () => {
  it("extracts direct dependency versions from npm package-lock packages", () => {
    const lock = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "demo", version: "0.0.0" },
        "node_modules/tar": { version: "7.5.16" },
        "node_modules/@types/node": { version: "26.0.1" },
      },
    });

    expect(extractNpmLockVersions(lock)).toEqual({
      tar: "7.5.16",
      "@types/node": "26.0.1",
    });
  });

  it("uses package-lock versions instead of declared range floors for npm OSV queries", () => {
    const declared = { tar: "^7.5.0", "@types/node": "^25.9.2" };
    const lock = JSON.stringify({
      packages: {
        "node_modules/tar": { version: "7.5.16" },
        "node_modules/@types/node": { version: "26.0.1" },
      },
    });

    expect(buildVulnQueries(declared, "npm", lock)).toEqual([
      { name: "tar", version: "7.5.16", ecosystem: "npm" },
      { name: "@types/node", version: "26.0.1", ecosystem: "npm" },
    ]);
  });

  it("falls back to concrete declared versions when the package-lock is missing a dependency", () => {
    const declared = { tar: "^7.5.0", missing: "~1.2.3" };
    const lock = JSON.stringify({
      packages: {
        "node_modules/tar": { version: "7.5.16" },
      },
    });

    expect(buildVulnQueries(declared, "npm", lock)).toEqual([
      { name: "tar", version: "7.5.16", ecosystem: "npm" },
      { name: "missing", version: "1.2.3", ecosystem: "npm" },
    ]);
  });
});

describe("countVulnerabilities", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Unique names per test because countVulnerabilities caches for 6 hours.
  function uniqueQuery(n: number): VulnQuery {
    return { name: `test-pkg-${n}-${Date.now()}`, version: "1.0.0", ecosystem: "npm" };
  }

  it("returns 0 with no queries without hitting the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await countVulnerabilities([])).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null when OSV responds with a non-ok status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("upstream boom", { status: 503 }),
    );
    expect(await countVulnerabilities([uniqueQuery(1)])).toBeNull();
  });

  it("returns null when the fetch itself rejects (timeout, network)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNRESET"));
    expect(await countVulnerabilities([uniqueQuery(2)])).toBeNull();
  });

  it("returns the total count on a successful response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ vulns: [{ id: "GHSA-1" }, { id: "GHSA-2" }] }],
        }),
        { status: 200 },
      ),
    );
    expect(await countVulnerabilities([uniqueQuery(3)])).toBe(2);
  });

  it("returns null if any batch fails, even when other batches succeed", async () => {
    // 101 queries → two batches (100 + 1). First succeeds with 1 vuln, second
    // fails. Result must be null: a partial count would understate risk.
    const queries: VulnQuery[] = Array.from({ length: 101 }, (_, i) => ({
      name: `multi-batch-${i}-${Date.now()}`,
      version: "1.0.0",
      ecosystem: "npm",
    }));

    let call = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      call++;
      if (call === 1) {
        return new Response(JSON.stringify({ results: [{ vulns: [{ id: "GHSA-X" }] }] }), {
          status: 200,
        });
      }
      return new Response("boom", { status: 500 });
    });

    expect(await countVulnerabilities(queries)).toBeNull();
  });
});
