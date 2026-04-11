import { describe, it, expect } from "vitest";
import { extractConcreteVersion } from "../lib/scanners/vulnerabilities";

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
