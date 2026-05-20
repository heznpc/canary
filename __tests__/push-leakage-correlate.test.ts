import { describe, it, expect } from "vitest";
import { pearson, ranks, spearman, buildJoined, correlatePairs } from "../experiments/src/push-leakage/correlate";

describe("pearson", () => {
  it("returns 1 for identical sequences", () => {
    expect(pearson([1, 2, 3, 4, 5], [1, 2, 3, 4, 5])).toBeCloseTo(1, 6);
  });

  it("returns -1 for perfectly inverse sequences", () => {
    expect(pearson([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])).toBeCloseTo(-1, 6);
  });

  it("returns a value in [-1, 1] for arbitrary inputs", () => {
    const r = pearson([1, 2, 3, 4, 5, 6], [3, 1, 4, 1, 5, 9]);
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThanOrEqual(-1);
    expect(r!).toBeLessThanOrEqual(1);
  });

  it("returns null when n < 3 or constant series", () => {
    expect(pearson([1, 2], [1, 2])).toBeNull();
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull(); // zero variance on x
  });
});

describe("ranks", () => {
  it("produces 1-based ranks for distinct values", () => {
    expect(ranks([10, 30, 20])).toEqual([1, 3, 2]);
  });

  it("averages ranks across ties", () => {
    // values 5, 5, 8: ranks should be [1.5, 1.5, 3]
    expect(ranks([5, 5, 8])).toEqual([1.5, 1.5, 3]);
    // values 1, 1, 2, 2: ranks [1.5, 1.5, 3.5, 3.5]
    expect(ranks([1, 1, 2, 2])).toEqual([1.5, 1.5, 3.5, 3.5]);
  });
});

describe("spearman", () => {
  it("returns 1 for monotone-increasing relationship even when nonlinear", () => {
    // y = x^3: nonlinear but monotone, Pearson < 1 but Spearman = 1
    const xs = [1, 2, 3, 4, 5];
    const ys = xs.map((x) => x ** 3);
    expect(spearman(xs, ys)).toBeCloseTo(1, 6);
  });

  it("returns null for n < 3", () => {
    expect(spearman([1, 2], [1, 2])).toBeNull();
  });
});

describe("buildJoined + correlatePairs", () => {
  it("joins by basename and includes nulls for unmatched repos", () => {
    const cam = [
      { repo: "heznpc/foo", cam: 0.5, totalCommits90d: 10 },
      { repo: "heznpc/bar", cam: 0.0, totalCommits90d: 5 },
      { repo: "heznpc/excluded", cam: 0, totalCommits90d: 0, excluded: true },
    ];
    const acr = [
      {
        repo: "heznpc/foo",
        windows: [
          { window: 30, totalCommits: 10, acr: 0.5 },
          { window: 90, totalCommits: 30, acr: 0.6 },
        ],
      },
      {
        repo: "heznpc/baz",
        windows: [{ window: 90, totalCommits: 15, acr: 0.2 }],
      },
    ];
    const pl = [
      { repoPath: "/some/where/foo", ucp_seconds: 1000, dirtyFiles: 1, ahead: 0, mip_seconds: null },
      { repoPath: "/some/where/qux", ucp_seconds: 2000, dirtyFiles: 1, ahead: 0, mip_seconds: null },
    ];
    const rows = buildJoined(cam, acr, pl);
    const byRepo = Object.fromEntries(rows.map((r) => [r.repo, r]));
    expect(byRepo.foo).toEqual({
      repo: "foo",
      cam: 0.5,
      acr_90d: 0.6,
      ucp_seconds: 1000,
      ahead: 0,
      mip_seconds: null,
    });
    expect(byRepo.bar.cam).toBe(0.0);
    expect(byRepo.bar.acr_90d).toBeNull();
    expect(byRepo.baz.cam).toBeNull();
    expect(byRepo.baz.acr_90d).toBe(0.2);
    expect(byRepo.qux.ucp_seconds).toBe(2000);
    // excluded CAM rows are dropped
    expect(byRepo.excluded).toBeUndefined();
  });

  it("produces correlations with correct n for each pair", () => {
    const rows = [
      { repo: "a", cam: 0.1, acr_90d: 0.2, ucp_seconds: 100, ahead: 0, mip_seconds: null },
      { repo: "b", cam: 0.5, acr_90d: 0.4, ucp_seconds: 200, ahead: 0, mip_seconds: null },
      { repo: "c", cam: 0.8, acr_90d: 0.7, ucp_seconds: null, ahead: 0, mip_seconds: null },
      { repo: "d", cam: null, acr_90d: 0.6, ucp_seconds: 300, ahead: 0, mip_seconds: null },
    ];
    const result = correlatePairs(rows);
    const camAcr = result.find((r) => r.pair === "CAM × ACR_90d")!;
    expect(camAcr.n).toBe(3); // a,b,c (d has null cam)
    const camUcp = result.find((r) => r.pair === "CAM × UCP")!;
    expect(camUcp.n).toBe(2); // a,b (c null ucp, d null cam)
  });
});
