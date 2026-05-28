import { describe, it, expect } from "vitest";
import { compareVersions, parseRepoSlug, batchCheckDeps, fetchWithTimeout, DisallowedFetchError, ALLOWED_HOSTS, isForbiddenHost } from "../lib/scanners/version-utils";
import type { DependencyInfo } from "../lib/types";

describe("parseRepoSlug", () => {
  it("parses a valid owner/repo slug", () => {
    const result = parseRepoSlug("vercel/next.js");
    expect(result).toEqual({ owner: "vercel", name: "next.js" });
  });

  it("returns null for a bare name without slash", () => {
    expect(parseRepoSlug("nextjs")).toBeNull();
  });

  it("returns null for too many segments", () => {
    expect(parseRepoSlug("a/b/c")).toBeNull();
  });

  it("returns null for empty segments", () => {
    expect(parseRepoSlug("/repo")).toBeNull();
    expect(parseRepoSlug("owner/")).toBeNull();
  });
});

describe("compareVersions", () => {
  it("detects a major version difference", () => {
    expect(compareVersions("2.0.0", "3.0.0")).toBe("major");
  });

  it("detects a minor version difference", () => {
    expect(compareVersions("3.1.0", "3.4.0")).toBe("minor");
  });

  it("detects a patch version difference", () => {
    expect(compareVersions("3.4.1", "3.4.5")).toBe("patch");
  });

  it("returns up-to-date when versions match", () => {
    expect(compareVersions("5.2.1", "5.2.1")).toBe("up-to-date");
  });

  it("returns up-to-date when current is ahead of latest", () => {
    // current major > latest major
    expect(compareVersions("4.0.0", "3.9.9")).toBe("up-to-date");
    // same major, current minor > latest minor
    expect(compareVersions("3.5.0", "3.4.0")).toBe("up-to-date");
  });

  it("handles two-segment versions gracefully (missing patch)", () => {
    expect(compareVersions("3.1", "3.4")).toBe("minor");
    expect(compareVersions("3.1", "3.1")).toBe("up-to-date");
  });

  it("normalizes non-numeric characters when normalize=true", () => {
    expect(compareVersions("2.0.0-beta", "3.0.0", true)).toBe("major");
    expect(compareVersions("v3.4.1", "3.4.5", true)).toBe("patch");
  });
});

describe("batchCheckDeps", () => {
  it("aggregates results from the check function", async () => {
    const entries = [
      { name: "a", ver: "1.0.0", latest: "2.0.0" },
      { name: "b", ver: "1.0.0", latest: "1.1.0" },
      { name: "c", ver: "1.0.0", latest: "1.0.1" },
      { name: "d", ver: "1.0.0", latest: "1.0.0" },
    ];

    const checkFn = async (entry: typeof entries[number]): Promise<DependencyInfo | null> => {
      const type = compareVersions(entry.ver, entry.latest);
      if (type === "up-to-date") return null;
      return { name: entry.name, current: entry.ver, latest: entry.latest, type };
    };

    const result = await batchCheckDeps(entries, checkFn, 2);

    expect(result.total).toBe(4);
    expect(result.outdatedMajor).toBe(1);
    expect(result.outdatedMinor).toBe(1);
    expect(result.outdatedPatch).toBe(1);
    expect(result.deps).toHaveLength(3); // up-to-date returns null, excluded
  });

  it("sorts deps by severity (major first)", async () => {
    const entries = [
      { name: "patch-pkg", ver: "1.0.0", latest: "1.0.9" },
      { name: "major-pkg", ver: "1.0.0", latest: "3.0.0" },
      { name: "minor-pkg", ver: "1.0.0", latest: "1.5.0" },
    ];

    const checkFn = async (e: typeof entries[number]): Promise<DependencyInfo | null> => {
      const type = compareVersions(e.ver, e.latest);
      return { name: e.name, current: e.ver, latest: e.latest, type };
    };

    const result = await batchCheckDeps(entries, checkFn);
    expect(result.deps[0].name).toBe("major-pkg");
    expect(result.deps[1].name).toBe("minor-pkg");
    expect(result.deps[2].name).toBe("patch-pkg");
  });

  it("handles empty input gracefully", async () => {
    const result = await batchCheckDeps(
      [],
      async () => null,
    );
    expect(result.total).toBe(0);
    expect(result.deps).toHaveLength(0);
  });

  it("handles all-null check results", async () => {
    const entries = ["a", "b", "c"];
    const result = await batchCheckDeps(
      entries,
      async () => null,
      2,
    );
    expect(result.total).toBe(3);
    expect(result.deps).toHaveLength(0);
    expect(result.outdatedMajor).toBe(0);
  });
});

describe("fetchWithTimeout host allow-list (SSRF defense-in-depth)", () => {
  it("rejects invalid URL strings without making a request", async () => {
    await expect(fetchWithTimeout("not a url")).rejects.toBeInstanceOf(DisallowedFetchError);
  });

  it("rejects http:// (downgrade) and any non-https protocol", async () => {
    await expect(fetchWithTimeout("http://api.github.com/repos/x/y")).rejects.toBeInstanceOf(DisallowedFetchError);
    await expect(fetchWithTimeout("file:///etc/passwd")).rejects.toBeInstanceOf(DisallowedFetchError);
    await expect(fetchWithTimeout("ftp://api.github.com/x")).rejects.toBeInstanceOf(DisallowedFetchError);
  });

  it("rejects unknown hosts even over https", async () => {
    await expect(fetchWithTimeout("https://attacker.example.com/x")).rejects.toBeInstanceOf(DisallowedFetchError);
    // Cloud metadata endpoint — the canonical SSRF target. Must be blocked.
    await expect(fetchWithTimeout("https://169.254.169.254/latest/meta-data/")).rejects.toBeInstanceOf(DisallowedFetchError);
  });

  it("rejects localhost and link-local addresses", async () => {
    await expect(fetchWithTimeout("https://localhost/x")).rejects.toBeInstanceOf(DisallowedFetchError);
    await expect(fetchWithTimeout("https://127.0.0.1/x")).rejects.toBeInstanceOf(DisallowedFetchError);
  });

  // ------------------------------------------------------------------
  // Findings from the 2026-05-29 5-angle code review.
  // ------------------------------------------------------------------

  it("rejects IPv6 loopback with brackets (review finding 3)", async () => {
    // URL.hostname returns `[::1]` (brackets) — pre-fix the set lookup
    // against the literal `::1` missed this and IPv6 loopback bypassed
    // the deny-list whenever allowAnyHost was set.
    await expect(fetchWithTimeout("https://[::1]/x", { allowAnyHost: true })).rejects.toBeInstanceOf(DisallowedFetchError);
    await expect(fetchWithTimeout("https://[::]/x", { allowAnyHost: true })).rejects.toBeInstanceOf(DisallowedFetchError);
  });

  it("rejects IPv4-mapped IPv6 loopback (review finding 3)", async () => {
    // Node parses `https://[::ffff:127.0.0.1]/` with hostname
    // `[::ffff:7f00:1]` — neither matches the literal entries. The hex
    // form must be unwrapped and the embedded IPv4 re-checked.
    await expect(fetchWithTimeout("https://[::ffff:7f00:1]/x", { allowAnyHost: true })).rejects.toBeInstanceOf(DisallowedFetchError);
  });

  it("rejects RFC1918 private ranges (review finding 6)", async () => {
    // FORBIDDEN_HOSTS used to be 6 literal strings; allowAnyHost callers
    // could probe the corporate LAN through them.
    await expect(fetchWithTimeout("https://10.0.0.1/", { allowAnyHost: true })).rejects.toBeInstanceOf(DisallowedFetchError);
    await expect(fetchWithTimeout("https://192.168.1.1/admin", { allowAnyHost: true })).rejects.toBeInstanceOf(DisallowedFetchError);
    await expect(fetchWithTimeout("https://172.16.0.5/", { allowAnyHost: true })).rejects.toBeInstanceOf(DisallowedFetchError);
    await expect(fetchWithTimeout("https://172.31.255.255/", { allowAnyHost: true })).rejects.toBeInstanceOf(DisallowedFetchError);
    // 172.15 and 172.32 are PUBLIC ranges — verify the boundary check
    // doesn't over-block.
    expect(isForbiddenHost("172.15.0.1")).toBe(false);
    expect(isForbiddenHost("172.32.0.1")).toBe(false);
  });

  it("rejects link-local 169.254/16 broadly, not just the metadata IP (review finding 6)", async () => {
    // Pre-fix, only 169.254.169.254 was blocked. Any other link-local
    // address (APIPA range, Kubernetes node-local DNS, etc.) was reachable.
    await expect(fetchWithTimeout("https://169.254.1.2/", { allowAnyHost: true })).rejects.toBeInstanceOf(DisallowedFetchError);
    await expect(fetchWithTimeout("https://169.254.169.253/", { allowAnyHost: true })).rejects.toBeInstanceOf(DisallowedFetchError);
  });

  it("rejects additional cloud metadata endpoints (review finding 6)", async () => {
    await expect(fetchWithTimeout("https://metadata.google.internal/", { allowAnyHost: true })).rejects.toBeInstanceOf(DisallowedFetchError);
    // Alibaba ECS
    await expect(fetchWithTimeout("https://100.100.100.200/", { allowAnyHost: true })).rejects.toBeInstanceOf(DisallowedFetchError);
    // Oracle OCI
    await expect(fetchWithTimeout("https://192.0.0.192/", { allowAnyHost: true })).rejects.toBeInstanceOf(DisallowedFetchError);
    // Azure metadata DNS name
    await expect(fetchWithTimeout("https://metadata.azure.com/", { allowAnyHost: true })).rejects.toBeInstanceOf(DisallowedFetchError);
  });

  it("rejects `0` hostname (Linux resolves to 0.0.0.0)", async () => {
    await expect(fetchWithTimeout("https://0/", { allowAnyHost: true })).rejects.toBeInstanceOf(DisallowedFetchError);
  });

  it("rejects IPv6 ULA (fc00::/7) and link-local (fe80::/10) ranges", async () => {
    expect(isForbiddenHost("fc00::1")).toBe(true);
    expect(isForbiddenHost("fd12:3456:789a::1")).toBe(true);
    expect(isForbiddenHost("fe80::1")).toBe(true);
    expect(isForbiddenHost("febc::1")).toBe(true);
    // fc/fd, fe8x-feBx — neighbours that should NOT match.
    expect(isForbiddenHost("ff00::1")).toBe(false);
    expect(isForbiddenHost("fec0::1")).toBe(false);
  });

  it("DisallowedFetchError serializes with name, message, reason, url (review finding 14)", () => {
    const e = new DisallowedFetchError("non-https protocol http:", "http://x");
    const json = JSON.parse(JSON.stringify(e));
    expect(json.name).toBe("DisallowedFetchError");
    expect(json.message).toContain("non-https protocol");
    expect(json.reason).toBe("non-https protocol http:");
    expect(json.url).toBe("http://x");
  });

  it("includes every host that any scanner module actually calls", () => {
    // Smoke test against host drift: if a scanner adds a new host without
    // listing it here, this test stays green but the fetch fails at runtime.
    // Conversely, removing a host from ALLOWED_HOSTS without removing the
    // scanner that uses it surfaces in the scanner's own tests.
    const required = [
      "api.github.com",
      "raw.githubusercontent.com",
      "registry.npmjs.org",
      "pypi.org",
      "pub.dev",
      "api.osv.dev",
      "endoflife.date",
      "api.semanticscholar.org",
      "doi.org",
      "chromewebstore.google.com",
      "api.anthropic.com",
    ];
    for (const host of required) {
      expect(ALLOWED_HOSTS.has(host)).toBe(true);
    }
  });
});
