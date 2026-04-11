import { describe, it, expect } from "vitest";
import { guessMigrationGuideUrl } from "../lib/scanners/releases";

describe("guessMigrationGuideUrl", () => {
  it("returns a Next.js upgrade URL when crossing a major", () => {
    const url = guessMigrationGuideUrl("vercel/next.js", "next", "15.4.0", "16.0.0");
    expect(url).toBe("https://nextjs.org/docs/app/building-your-application/upgrading/version-16");
  });

  it("returns a React blog URL when crossing a major", () => {
    const url = guessMigrationGuideUrl("facebook/react", "react", "18.0.0", "19.0.0");
    expect(url).toBe("https://react.dev/blog/react-19");
  });

  it("returns the static TypeScript release notes URL", () => {
    const url = guessMigrationGuideUrl(
      "microsoft/TypeScript",
      "typescript",
      "4.9.0",
      "5.0.0",
    );
    expect(url).toBe("https://www.typescriptlang.org/docs/handbook/release-notes/overview.html");
  });

  it("returns undefined for unknown packages", () => {
    expect(guessMigrationGuideUrl("foo/bar", "leftpad", "1.0.0", "2.0.0")).toBeUndefined();
  });

  it("returns undefined when not crossing a major boundary", () => {
    expect(guessMigrationGuideUrl("vercel/next.js", "next", "16.0.0", "16.2.1")).toBeUndefined();
  });

  it("substitutes both {from} and {to} placeholders", () => {
    const url = guessMigrationGuideUrl("expressjs/express", "express", "4.0.0", "5.0.0");
    expect(url).toBe("https://expressjs.com/en/guide/migrating-5.html");
  });
});
