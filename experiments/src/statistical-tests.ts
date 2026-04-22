/**
 * Statistical Tests for CAM / ACR Experiments
 *
 * 1. Bootstrap 95% confidence intervals for mean CAM and mean ACR by subgroup
 * 2. Mann-Whitney U test: developer-led vs foundation-governed repos
 * 3. Effect size (rank-biserial correlation)
 *
 * Usage: npx tsx scripts/statistical-tests.ts
 */

import { readFileSync } from "fs";
import { writeFile } from "fs/promises";
import { resolve } from "path";

// --- Load result files ---
const basePath = resolve(new URL("../results", import.meta.url).pathname);

const camResults = JSON.parse(readFileSync(resolve(basePath, "cam-results.json"), "utf-8"));
const acrResults = JSON.parse(readFileSync(resolve(basePath, "acr-results.json"), "utf-8"));

// --- Governance classification ---
// Operationalized criterion: a project is "foundation-governed" if its primary
// governance authority is a non-profit foundation (Apache Software Foundation,
// Linux Foundation / CNCF, Python Software Foundation, OpenJS Foundation,
// Rust Foundation, Django Software Foundation) OR it follows a formal proposal
// process (PEP, KEP, Go proposals, RFC). All others are "developer-led."
//
// Classification table:
//   torvalds/linux           → Linux Foundation
//   kubernetes/kubernetes    → CNCF (Linux Foundation)
//   golang/go                → Google + Go proposal process
//   python/cpython           → PSF + PEP process
//   spring-projects/spring-boot → VMware/Broadcom (corporate governance, formal process)
//   apache/kafka             → Apache Software Foundation
//   nodejs/node              → OpenJS Foundation
//   docker/cli               → Moby project governance
//   rust-lang/rust           → Rust Foundation + RFC process
//   prometheus/prometheus    → CNCF (Linux Foundation)
//   django/django            → Django Software Foundation (DSF)
//
const FOUNDATION_GOVERNED = new Set([
  "torvalds/linux", "kubernetes/kubernetes", "golang/go", "python/cpython",
  "spring-projects/spring-boot", "apache/kafka", "nodejs/node",
  "docker/cli", "rust-lang/rust",
  "prometheus/prometheus",  // CNCF graduated project
  "django/django",          // Django Software Foundation
]);

// Developer-led: maintainer-driven governance, no formal foundation or
// proposal process required for contribution.
//
// Classification table:
//   facebook/react           → Meta Open Source (corporate, no foundation)
//   vercel/next.js           → Vercel (corporate)
//   microsoft/typescript     → Microsoft (corporate)
//   tailwindlabs/tailwindcss → Tailwind Labs (small company)
//   shadcn-ui/ui             → Individual maintainer
//   sveltejs/svelte          → Community + Vercel sponsorship
//   remix-run/remix          → Shopify (corporate)
//   vitejs/vite              → Community + corporate sponsors
//   denoland/deno            → Deno Land Inc (small company)
//   pallets/flask            → Pallets community org (no formal foundation)
//
const DEVELOPER_LED = new Set([
  "facebook/react", "vercel/next.js", "microsoft/typescript",
  "tailwindlabs/tailwindcss", "shadcn-ui/ui", "sveltejs/svelte",
  "remix-run/remix", "vitejs/vite", "denoland/deno",
  "pallets/flask",
]);

// --- Statistical utilities ---

function bootstrap(
  data: number[],
  statFn: (arr: number[]) => number,
  nBoot: number = 10000,
  alpha: number = 0.05,
): { estimate: number; ci: [number, number]; se: number } {
  const estimate = statFn(data);
  const bootStats: number[] = [];

  for (let i = 0; i < nBoot; i++) {
    const sample: number[] = [];
    for (let j = 0; j < data.length; j++) {
      sample.push(data[Math.floor(Math.random() * data.length)]);
    }
    bootStats.push(statFn(sample));
  }

  bootStats.sort((a, b) => a - b);
  const lo = bootStats[Math.floor((alpha / 2) * nBoot)];
  const hi = bootStats[Math.floor((1 - alpha / 2) * nBoot)];
  const se = Math.sqrt(
    bootStats.reduce((sum, x) => sum + (x - estimate) ** 2, 0) / (nBoot - 1),
  );

  return { estimate, ci: [lo, hi], se };
}

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length === 0 ? 0 : s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Mann-Whitney U test (two-sided)
 * Returns { U, z, p, n1, n2, rankBiserial }
 */
function mannWhitneyU(
  group1: number[],
  group2: number[],
): { U: number; z: number; p: number; n1: number; n2: number; rankBiserial: number } {
  const n1 = group1.length;
  const n2 = group2.length;

  // Combine and rank
  const combined = [
    ...group1.map((v) => ({ value: v, group: 1 })),
    ...group2.map((v) => ({ value: v, group: 2 })),
  ];
  combined.sort((a, b) => a.value - b.value);

  // Assign ranks with tie correction
  const ranks: number[] = new Array(combined.length);
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j < combined.length && combined[j].value === combined[i].value) j++;
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) ranks[k] = avgRank;
    i = j;
  }

  // Sum ranks for group 1
  let R1 = 0;
  for (let k = 0; k < combined.length; k++) {
    if (combined[k].group === 1) R1 += ranks[k];
  }

  const U1 = R1 - (n1 * (n1 + 1)) / 2;
  const U2 = n1 * n2 - U1;
  const U = Math.min(U1, U2);

  // Normal approximation
  const mu = (n1 * n2) / 2;
  const sigma = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  const z = sigma > 0 ? (U1 - mu) / sigma : 0;
  const p = 2 * (1 - normalCDF(Math.abs(z)));

  // Rank-biserial correlation (effect size)
  const rankBiserial = 1 - (2 * U) / (n1 * n2);

  return { U, z, p, n1, n2, rankBiserial };
}

function normalCDF(x: number): number {
  // Approximation of standard normal CDF
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

function formatPct(v: number): string { return (v * 100).toFixed(1) + "%"; }
function formatCI(ci: [number, number]): string {
  return `[${formatPct(ci[0])}, ${formatPct(ci[1])}]`;
}

// --- Extract data ---

interface CAMRecord {
  repo: string;
  cam: number;
  subgroup?: string;
  excluded?: boolean;
}

interface ACRWindow {
  window: number;
  acr: number;
  excluded?: boolean;
}

interface ACRRecord {
  repo: string;
  subgroup?: string;
  windows?: ACRWindow[];
}

// CAM 90d from cam-results.json
function extractCAM90d(results: CAMRecord[]): { repo: string; cam: number; subgroup?: string }[] {
  return results
    .filter((r) => !r.excluded)
    .map((r) => ({ repo: r.repo, cam: r.cam, subgroup: r.subgroup }));
}

// ACR 90d from acr-results.json
function extractACR90d(results: ACRRecord[]): { repo: string; acr: number; subgroup?: string }[] {
  const out: { repo: string; acr: number; subgroup?: string }[] = [];
  for (const r of results) {
    const w90 = r.windows?.find((w) => w.window === 90);
    if (!w90 || w90.excluded) continue;
    out.push({ repo: r.repo, acr: w90.acr, subgroup: r.subgroup });
  }
  return out;
}

// --- Main ---
async function main() {
  console.log("=== Statistical Tests for CAM / ACR ===\n");

  // 1. Extract data
  const camRef = extractCAM90d(camResults.refResults);
  const camUser = extractCAM90d(camResults.userResults);
  const acrRef = extractACR90d(acrResults.refResults);
  const acrUser = extractACR90d(acrResults.userResults);

  // Subgroups for CAM
  const camTraditional = camRef.filter((r) => r.subgroup === "traditional");
  const camAIAdj = camRef.filter((r) => r.subgroup === "ai-adjacent");

  // Governance split for CAM (traditional only)
  const camDevLed = camTraditional.filter((r) => DEVELOPER_LED.has(r.repo));
  const camFoundation = camTraditional.filter((r) => FOUNDATION_GOVERNED.has(r.repo));

  // Subgroups for ACR
  const acrTraditional = acrRef.filter((r) => r.subgroup === "traditional");
  const acrDevLed = acrTraditional.filter((r) => DEVELOPER_LED.has(r.repo));
  const acrFoundation = acrTraditional.filter((r) => FOUNDATION_GOVERNED.has(r.repo));

  // 2. Bootstrap CIs for CAM
  console.log("========================================");
  console.log("  BOOTSTRAP 95% CI — CAM (90d)");
  console.log("========================================\n");

  const camGroups = [
    { label: "User portfolio", data: camUser.map((r) => r.cam) },
    { label: "AI-adjacent", data: camAIAdj.map((r) => r.cam) },
    { label: "Traditional (all)", data: camTraditional.map((r) => r.cam) },
    { label: "  Developer-led", data: camDevLed.map((r) => r.cam) },
    { label: "  Foundation-governed", data: camFoundation.map((r) => r.cam) },
  ];

  console.log(`${"Group".padEnd(25)} | ${"n".padStart(3)} | ${"Mean".padStart(8)} | ${"95% CI".padStart(20)} | ${"SE".padStart(8)}`);
  console.log("-".repeat(75));

  for (const g of camGroups) {
    if (g.data.length < 2) {
      console.log(`${g.label.padEnd(25)} | ${String(g.data.length).padStart(3)} | ${"(n<2)".padStart(8)} |`);
      continue;
    }
    const b = bootstrap(g.data, mean);
    console.log(
      `${g.label.padEnd(25)} | ${String(g.data.length).padStart(3)} | ${formatPct(b.estimate).padStart(8)} | ${formatCI(b.ci).padStart(20)} | ${formatPct(b.se).padStart(8)}`,
    );
  }

  // 3. Bootstrap CIs for ACR
  console.log("\n========================================");
  console.log("  BOOTSTRAP 95% CI — ACR (90d)");
  console.log("========================================\n");

  const acrGroups = [
    { label: "User portfolio", data: acrUser.map((r) => r.acr) },
    { label: "AI-adjacent", data: acrRef.filter((r) => r.subgroup === "ai-adjacent").map((r) => r.acr) },
    { label: "Traditional (all)", data: acrTraditional.map((r) => r.acr) },
    { label: "  Developer-led", data: acrDevLed.map((r) => r.acr) },
    { label: "  Foundation-governed", data: acrFoundation.map((r) => r.acr) },
  ];

  console.log(`${"Group".padEnd(25)} | ${"n".padStart(3)} | ${"Mean".padStart(8)} | ${"95% CI".padStart(20)} | ${"SE".padStart(8)}`);
  console.log("-".repeat(75));

  for (const g of acrGroups) {
    if (g.data.length < 2) {
      console.log(`${g.label.padEnd(25)} | ${String(g.data.length).padStart(3)} | ${"(n<2)".padStart(8)} |`);
      continue;
    }
    const b = bootstrap(g.data, mean);
    console.log(
      `${g.label.padEnd(25)} | ${String(g.data.length).padStart(3)} | ${formatPct(b.estimate).padStart(8)} | ${formatCI(b.ci).padStart(20)} | ${formatPct(b.se).padStart(8)}`,
    );
  }

  // 4. Mann-Whitney U tests
  console.log("\n========================================");
  console.log("  MANN-WHITNEY U TESTS");
  console.log("  Developer-led vs Foundation-governed");
  console.log("========================================\n");

  // CAM: developer-led vs foundation-governed
  const camMW = mannWhitneyU(
    camDevLed.map((r) => r.cam),
    camFoundation.map((r) => r.cam),
  );
  console.log("CAM (90d):");
  console.log(`  Developer-led (n=${camMW.n1}): mean=${formatPct(mean(camDevLed.map((r) => r.cam)))}, median=${formatPct(median(camDevLed.map((r) => r.cam)))}`);
  console.log(`  Foundation-gov (n=${camMW.n2}): mean=${formatPct(mean(camFoundation.map((r) => r.cam)))}, median=${formatPct(median(camFoundation.map((r) => r.cam)))}`);
  console.log(`  U=${camMW.U.toFixed(1)}, z=${camMW.z.toFixed(3)}, p=${camMW.p < 0.001 ? "<0.001" : camMW.p.toFixed(4)}`);
  console.log(`  Effect size (rank-biserial r)=${camMW.rankBiserial.toFixed(3)}`);
  console.log(`  Interpretation: ${interpretEffect(camMW.rankBiserial)}`);

  // ACR: developer-led vs foundation-governed
  const acrMW = mannWhitneyU(
    acrDevLed.map((r) => r.acr),
    acrFoundation.map((r) => r.acr),
  );
  console.log("\nACR (90d):");
  console.log(`  Developer-led (n=${acrMW.n1}): mean=${formatPct(mean(acrDevLed.map((r) => r.acr)))}, median=${formatPct(median(acrDevLed.map((r) => r.acr)))}`);
  console.log(`  Foundation-gov (n=${acrMW.n2}): mean=${formatPct(mean(acrFoundation.map((r) => r.acr)))}, median=${formatPct(median(acrFoundation.map((r) => r.acr)))}`);
  console.log(`  U=${acrMW.U.toFixed(1)}, z=${acrMW.z.toFixed(3)}, p=${acrMW.p < 0.001 ? "<0.001" : acrMW.p.toFixed(4)}`);
  console.log(`  Effect size (rank-biserial r)=${acrMW.rankBiserial.toFixed(3)}`);
  console.log(`  Interpretation: ${interpretEffect(acrMW.rankBiserial)}`);

  // 5. Data listing for transparency
  console.log("\n--- Raw data: Developer-led repos ---");
  for (const r of camDevLed) {
    const acr = acrDevLed.find((a) => a.repo === r.repo);
    console.log(`  ${r.repo.padEnd(35)} CAM=${formatPct(r.cam).padStart(6)}  ACR=${acr ? formatPct(acr.acr).padStart(6) : "N/A"}`);
  }
  console.log("\n--- Raw data: Foundation-governed repos ---");
  for (const r of camFoundation) {
    const acr = acrFoundation.find((a) => a.repo === r.repo);
    console.log(`  ${r.repo.padEnd(35)} CAM=${formatPct(r.cam).padStart(6)}  ACR=${acr ? formatPct(acr.acr).padStart(6) : "N/A"}`);
  }

  // 6. Save results
  const output = {
    timestamp: new Date().toISOString(),
    cam: {
      bootstrapCI: Object.fromEntries(
        camGroups.filter((g) => g.data.length >= 2).map((g) => {
          const b = bootstrap(g.data, mean);
          return [g.label.trim(), { n: g.data.length, mean: b.estimate, ci95: b.ci, se: b.se }];
        }),
      ),
      mannWhitneyU: {
        devLed: { n: camMW.n1, repos: camDevLed.map((r) => r.repo), values: camDevLed.map((r) => r.cam) },
        foundation: { n: camMW.n2, repos: camFoundation.map((r) => r.repo), values: camFoundation.map((r) => r.cam) },
        U: camMW.U, z: camMW.z, p: camMW.p, rankBiserial: camMW.rankBiserial,
      },
    },
    acr: {
      bootstrapCI: Object.fromEntries(
        acrGroups.filter((g) => g.data.length >= 2).map((g) => {
          const b = bootstrap(g.data, mean);
          return [g.label.trim(), { n: g.data.length, mean: b.estimate, ci95: b.ci, se: b.se }];
        }),
      ),
      mannWhitneyU: {
        devLed: { n: acrMW.n1, repos: acrDevLed.map((r) => r.repo), values: acrDevLed.map((r) => r.acr) },
        foundation: { n: acrMW.n2, repos: acrFoundation.map((r) => r.repo), values: acrFoundation.map((r) => r.acr) },
        U: acrMW.U, z: acrMW.z, p: acrMW.p, rankBiserial: acrMW.rankBiserial,
      },
    },
    governanceClassification: {
      developerLed: [...DEVELOPER_LED],
      foundationGoverned: [...FOUNDATION_GOVERNED],
    },
  };

  const outputPath = resolve(basePath, "statistical-tests-results.json");
  await writeFile(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nResults saved to ${outputPath}`);
}

function interpretEffect(r: number): string {
  const abs = Math.abs(r);
  if (abs < 0.1) return "negligible";
  if (abs < 0.3) return "small";
  if (abs < 0.5) return "medium";
  return "large";
}

main().catch(console.error);
