import { describe, it, expect } from "vitest";
import {
  estimateReleasesBehind,
  extractVersionFromPkg,
  isCycleEol,
} from "../lib/scanners/stack";

describe("estimateReleasesBehind", () => {
  it("returns 0 when current matches latest major", () => {
    expect(estimateReleasesBehind("16.2.1", "16")).toBe(0);
  });

  it("returns delta when current is behind", () => {
    expect(estimateReleasesBehind("14.0.0", "16")).toBe(2);
  });

  it("clamps to 0 when current is ahead of latest", () => {
    expect(estimateReleasesBehind("17.0.0", "16")).toBe(0);
  });

  it("returns 0 for non-numeric input", () => {
    expect(estimateReleasesBehind("nightly", "16")).toBe(0);
    expect(estimateReleasesBehind("1.0.0", "N/A")).toBe(0);
  });
});

describe("extractVersionFromPkg", () => {
  it("reads from dependencies", () => {
    const pkg = { dependencies: { next: "^16.2.1" } };
    expect(extractVersionFromPkg(pkg, "next")).toBe("16.2.1");
  });

  it("reads from devDependencies", () => {
    const pkg = { devDependencies: { typescript: "~5.4.0" } };
    expect(extractVersionFromPkg(pkg, "typescript")).toBe("5.4.0");
  });

  it("prefers dependencies over devDependencies", () => {
    const pkg = {
      dependencies: { react: "^19.0.0" },
      devDependencies: { react: "^18.0.0" },
    };
    expect(extractVersionFromPkg(pkg, "react")).toBe("19.0.0");
  });

  it("returns null for missing package", () => {
    expect(extractVersionFromPkg({}, "next")).toBeNull();
  });

  it("strips caret/tilde/comparison prefixes", () => {
    expect(extractVersionFromPkg({ dependencies: { foo: ">=2.0.0" } }, "foo")).toBe("2.0.0");
  });
});

describe("isCycleEol", () => {
  const now = Date.parse("2026-04-11T00:00:00Z");

  it("treats boolean true as EOL", () => {
    expect(isCycleEol(true, now)).toBe(true);
  });

  it("treats boolean false as not EOL", () => {
    expect(isCycleEol(false, now)).toBe(false);
  });

  it("treats undefined as not EOL", () => {
    expect(isCycleEol(undefined, now)).toBe(false);
  });

  it("treats past date string as EOL", () => {
    expect(isCycleEol("2024-01-01", now)).toBe(true);
  });

  it("treats future date string as not EOL", () => {
    expect(isCycleEol("2030-01-01", now)).toBe(false);
  });

  it("treats malformed date string as not EOL", () => {
    expect(isCycleEol("not-a-date", now)).toBe(false);
  });
});
