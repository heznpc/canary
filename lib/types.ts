import type { ProjectConfig } from "./projects";

export interface GitStatus {
  branch: string;
  /** ISO timestamp of the last commit on the default branch, if available. */
  lastCommitDate: string | null;
  lastCommitMessage: string | null;
}

export interface DependencyInfo {
  name: string;
  current: string;
  latest: string;
  type: "major" | "minor" | "patch" | "up-to-date";
  githubRepo?: string;
  isKey?: boolean;
}

export interface DependencyHealth {
  total: number;
  outdatedMajor: number;
  outdatedMinor: number;
  outdatedPatch: number;
  /** OSV advisory count. `null` means the scan could not be completed (network
   *  error, timeout) — do not treat as zero. */
  vulnerabilities: number | null;
  deps: DependencyInfo[];
  packageManager:
    | "pnpm" | "npm" | "yarn"
    | "pip" | "uv" | "poetry"
    | "flutter"
    | "gradle" | "maven"
    | "unknown";
}

export interface UpdateAction {
  name: string;
  current: string;
  latest: string;
  severity: "major" | "minor" | "patch";
  command: string;
  githubRepo?: string;
  changelogUrl?: string;
}

export interface ReleaseHighlight {
  version: string;
  date: string;
  url: string;
  breaking: string[];
  highlights: string[];
}

export interface ReleaseNoteSummary {
  packageName: string;
  from: string;
  to: string;
  releases: ReleaseHighlight[];
  migrationGuideUrl?: string;
}

export interface VibeCodingIntel {
  hasAgentsMd: boolean;
  hasClaudeMd: boolean;
  gotchas: string[];
  tips: string[];
}

export interface RecentPaper {
  title: string;
  authors: string;
  year: number;
  venue?: string;
  citationCount: number;
  url: string;
  tldr?: string;
}

export interface ResearchIntel {
  recentPapers: RecentPaper[];
  trendingKeywords: string[];
  fieldActivity: "hot" | "active" | "stable" | "quiet";
  suggestion: string;
  lastChecked: string;
}

export interface StackVersion {
  name: string;
  current: string | null;
  latest: string | null;
  eol: boolean;
  releasesBehind: number;
}

export interface DeployStatus {
  target: string;
  status: "up" | "down" | "unknown" | "not-deployed";
  url?: string;
  version?: string;
  lastChecked: string;
}

export type HealthGrade = "A" | "B" | "C" | "D" | "F";
export type Recommendation = "keep" | "update" | "upgrade" | "rewrite" | "archive";

/* ── Doc Freshness ── */

export interface DocMismatch {
  file: string;
  field: string;
  expected: string;
  actual: string;
  severity: "error" | "warning";
}

export interface DocFreshness {
  readmeVersionMatch: boolean;
  changelogUpToDate: boolean;
  todoStaleness: number;
  agentsMdExists: boolean;
  claudeMdExists: boolean;
  mismatches: DocMismatch[];
  lastChecked: string;
}

/* ── Code Quality ── */

export interface CodeQuality {
  hasCI: boolean;
  ciPlatforms: string[];
  hasTests: boolean;
  testFramework: string | null;
  hasLint: boolean;
  hasTypeCheck: boolean;
  hasLicense: boolean;
  hasContributing: boolean;
  hasSecurityPolicy: boolean;
  hasDependencyBot: boolean;
  dependencyBotName: string | null;
  score: number;
  lastChecked: string;
}

/* ── OpenSSF Scorecard ── */

export interface ScorecardCheck {
  name: string;
  score: number;
  reason: string;
}

export interface ScorecardResult {
  score: number;
  checks: ScorecardCheck[];
  date: string;
  lastChecked: string;
}

/* ── Activity Pulse ── */

export interface ActivityPulse {
  commitsLast4Weeks: number;
  openPRs: number;
  openIssues: number;
  contributors: number;
  weeklyCommitAvg: number;
  lastChecked: string;
}

/* ── Data Freshness ── */

export interface DataFreshnessStatus {
  lastUpdateDate: string | null;   // ISO date of last commit touching watchPath
  lastUpdateMessage: string | null;
  daysSinceUpdate: number | null;
  expectedCycle: string;
  stale: boolean;                  // true if past grace period
  nextExpectedDate: string | null; // ISO date of next expected update
  lastChecked: string;
}

/* ── Context Attention Metric (CAM) ── */

export type AgentFileCategory =
  | "agents-md"
  | "claude-md"
  | "cursor"
  | "copilot"
  | "other-agent";

export interface ContextAttention {
  /** CAM = contextCommits / totalCommits over the 90-day window. 0 if no commits. */
  cam: number;
  /** Total commits in the 90-day window. */
  totalCommits: number;
  /** Commits touching at least one agent-era file. */
  contextCommits: number;
  /** Detected agent-era files in the repository tree. */
  agentEraFiles: string[];
  /** Files grouped by category for display. */
  fileBreakdown: Record<AgentFileCategory, string[]>;
  /** Window length in days. */
  windowDays: number;
  lastChecked: string;
}

/* ── Agent-Authored Commit Ratio (ACR) ── */

export type AgentTool = "claude" | "copilot" | "cursor" | "devin" | "other";

export interface AgentAuthorship {
  /** ACR = agentCommits / totalCommits over the 90-day window. */
  acr: number;
  /** Total commits inspected (sampled if very large). */
  totalCommits: number;
  /** Commits with detected AI co-author markers. */
  agentCommits: number;
  /** Commits authored/co-authored by traditional automation (Dependabot, Renovate, etc.). */
  botCommits: number;
  /** Per-tool commit counts for the AI markers detected. */
  toolBreakdown: Record<AgentTool, number>;
  /** Tool with the most detected commits, or null if none. */
  dominantTool: AgentTool | null;
  /** Whether the totalCommits was sampled (cap reached). */
  sampled: boolean;
  windowDays: number;
  lastChecked: string;
}

/* ── Anthropic API Usage ── */

export interface AnthropicUsageByModel {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  estimatedUsd: number;
}

export interface AnthropicUsage {
  /** Start of the reporting window (inclusive, ISO 8601). */
  startingAt: string;
  /** End of the reporting window (exclusive, ISO 8601). */
  endingAt: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreateTokens: number;
  totalEstimatedUsd: number;
  byModel: AnthropicUsageByModel[];
  lastChecked: string;
}

/* ── Recent External-Contributor Issues ── */

export interface RecentIssue {
  /** Issue number (per repo). */
  number: number;
  title: string;
  /** GitHub HTML URL of the issue. */
  url: string;
  /** Login name of the issue author (excluded from "external" set if it equals
   *  the repo owner or the configured self-login). */
  author: string;
  /** Whether GitHub flagged this user as a bot (login ending in `[bot]`). */
  authorIsBot: boolean;
  /** ISO 8601 of issue creation. */
  createdAt: string;
  /** Comment count, useful for "needs reply" surfacing. */
  comments: number;
  /** Label names attached to the issue. */
  labels: string[];
  /** Issue state — we keep only "open" issues in the digest, but the field is
   *  preserved for future filtering. */
  state: "open" | "closed";
}

export interface RecentIssueDigest {
  /** Repo slug ("owner/name"). */
  repo: string;
  /**
   * Open issues authored by external contributors (i.e., not the repo owner
   * and not the configured self-login), created within the last `windowDays`.
   * Sorted newest first, capped at 20.
   */
  external: RecentIssue[];
  /** Open issues authored by the repo owner / self-login (informational). */
  selfAuthored: number;
  /** Total open issues in the window across both buckets, before capping. */
  totalInWindow: number;
  /** Window length in days the digest covers. */
  windowDays: number;
  /** ISO timestamp of the scan. */
  lastChecked: string;
}

/* ── Metadatafication Phase ── */

export type MetadataficationPhase = "active-tool" | "assisted-tool" | "infrastructure-metadata";

export interface MetadataficationStatus {
  /** Current phase classification per the §3.1 definition. */
  phase: MetadataficationPhase;
  /** Short rationale string explaining the classification. */
  rationale: string;
  /** 0-100 score indicating how far along the metadatafication trajectory the project is. */
  progressScore: number;
}

export interface ProjectHealth {
  project: ProjectConfig;
  git: GitStatus | null;
  dependencies: DependencyHealth | null;
  stack: StackVersion[];
  deploy: DeployStatus;
  updateActions: UpdateAction[];
  vibeCoding: VibeCodingIntel;
  research: ResearchIntel | null;
  codeQuality: CodeQuality | null;
  scorecard: ScorecardResult | null;
  activity: ActivityPulse | null;
  docFreshness: DocFreshness | null;
  dataFreshness: DataFreshnessStatus | null;
  contextAttention: ContextAttention | null;
  agentAuthorship: AgentAuthorship | null;
  metadatafication: MetadataficationStatus | null;
  recentIssues: RecentIssueDigest | null;
  grade: HealthGrade;
  recommendation: Recommendation;
  reasons: string[];
  scannedAt: string;
}

export interface DashboardData {
  projects: ProjectHealth[];
  summary: {
    total: number;
    healthy: number;
    needsUpdate: number;
    critical: number;
    archived: number;
  };
  lastScan: string;
}
