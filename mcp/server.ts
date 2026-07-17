#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { homedir } from "os";
import { join } from "path";
import { scanAll, scanProject } from "@/lib/scanners";
import { getDependencyHealth, generateUpdateActions } from "@/lib/scanners/github";
import { projects } from "@/lib/projects";
import { checkAnthropicUsage } from "@/lib/scanners/anthropic-usage";
import { checkRecentIssues } from "@/lib/scanners/recent-issues";
import {
  scanAllSessions,
  aggregateByRepo,
  scanSessionFile,
} from "@/experiments/src/push-leakage/transcript-scan";
import { scanRepos } from "@/experiments/src/push-leakage/repo-scan";
import {
  joinReposWithSessions,
  computePortfolio,
  fmtDuration,
} from "@/experiments/src/push-leakage/metrics";
import { readdirSync, statSync } from "fs";
import {
  buildScanProjectPayload,
  buildScanAllPayload,
  buildUsagePayload,
  buildUpdateActionsPayload,
} from "./adapters";
import { withTraceMeta } from "./trace-meta";
import { fenceUntrusted, UNTRUSTED_OPEN, UNTRUSTED_CLOSE } from "./untrusted";
import { redactDetail, renderDetailAsText } from "@/lib/sessions/redact";
import {
  getFileAccessAggregates,
  getSessionsIndex,
  isAllowedTranscriptPath,
  parseSessionDetail,
} from "@/lib/sessions/scan";
import { FRICTION_CATEGORIES, scanFriction } from "@/lib/sessions/friction";
import { SESSION_SOURCE_VALUES } from "@/lib/sessions/types";

/**
 * stdio MCP server exposing canary scanners as tools. Runs out-of-process so
 * Claude Code / Claude Desktop can call `scan_project`, `scan_all`, and
 * `get_anthropic_usage` without spinning up the Next.js web app.
 *
 * Adapter functions keep the MCP DTOs decoupled from internal scanner types —
 * if a scanner's return shape changes, only adapters need updating, not this
 * transport-layer file.
 */

function errorResponse(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    isError: true,
  };
}

function unknownProjectError(projectId: string) {
  return errorResponse(
    `Unknown projectId: ${projectId}. Known: ${projects.map((p) => p.id).join(", ")}`,
  );
}

async function main() {
  const server = new McpServer({ name: "canary", version: "0.1.0" });

  server.registerTool(
    "scan_project",
    {
      title: "Scan a single project",
      description:
        "Run canary's full scanner pipeline on one project (deps, vulnerabilities, stack, deploy, CAM/ACR, grade) and return a structured health report.",
      inputSchema: { projectId: z.string().describe("Project ID as defined in canary.config.ts") },
    },
    async ({ projectId }, extra) => {
      const project = projects.find((p) => p.id === projectId);
      if (!project) return withTraceMeta(unknownProjectError(projectId), extra);
      const health = await scanProject(project);
      return withTraceMeta(
        { content: [{ type: "text", text: JSON.stringify(buildScanProjectPayload(health), null, 2) }] },
        extra,
      );
    },
  );

  server.registerTool(
    "scan_all",
    {
      title: "Scan all configured projects",
      description:
        "Run canary scans across every project in canary.config.ts and return a dashboard summary plus per-project grades.",
      inputSchema: {},
    },
    async (extra) => {
      const data = await scanAll();
      return withTraceMeta(
        { content: [{ type: "text", text: JSON.stringify(buildScanAllPayload(data), null, 2) }] },
        extra,
      );
    },
  );

  server.registerTool(
    "list_update_actions",
    {
      title: "List pending dependency update actions for a project",
      description:
        "Return the concrete update commands (e.g. `pnpm up foo@1.2.3`) and changelog links for every outdated dependency in one project, grouped by severity. Skips CAM/ACR/scorecard/activity scans for speed.",
      inputSchema: { projectId: z.string().describe("Project ID as defined in canary.config.ts") },
    },
    async ({ projectId }, extra) => {
      const project = projects.find((p) => p.id === projectId);
      if (!project) return withTraceMeta(unknownProjectError(projectId), extra);
      if (!project.repo) {
        return withTraceMeta(
          errorResponse(`Project '${projectId}' has no GitHub repo configured; nothing to update-scan.`),
          extra,
        );
      }
      const depResult = await getDependencyHealth(project.repo);
      if (!depResult) {
        return withTraceMeta(errorResponse(`No dependency manifest detected for '${projectId}'.`), extra);
      }
      const actions = generateUpdateActions(depResult.health);
      return withTraceMeta(
        {
          content: [{
            type: "text" as const,
            text: JSON.stringify(
              buildUpdateActionsPayload({
                project,
                packageManager: depResult.health.packageManager,
                actions,
              }),
              null,
              2,
            ),
          }],
        },
        extra,
      );
    },
  );

  server.registerTool(
    "get_anthropic_usage",
    {
      title: "Fetch Anthropic API usage for the org",
      description:
        "Call the Anthropic Admin API to retrieve token usage and cost totals for the last N days. Requires ANTHROPIC_ADMIN_API_KEY.",
      inputSchema: {
        days: z
          .number()
          .int()
          .min(1)
          .max(31)
          .optional()
          .describe("Window size in days, 1-31. Defaults to 7."),
      },
    },
    async ({ days }, extra) => {
      const usage = await checkAnthropicUsage(days ?? 7);
      if (!usage) {
        return withTraceMeta(
          errorResponse(
            "ANTHROPIC_ADMIN_API_KEY is not set or the Admin API request failed. Set the env var and retry.",
          ),
          extra,
        );
      }
      return withTraceMeta(
        { content: [{ type: "text", text: JSON.stringify(buildUsagePayload(usage), null, 2) }] },
        extra,
      );
    },
  );

  server.registerTool(
    "list_leaking_repos",
    {
      title: "List repos with unpushed agent-touched commits (local-only data)",
      description:
        "Scan one or more roots for git repos and join with Claude Code session transcripts under ~/.claude/projects to surface repos in MIP > thresholdDays (Metadata-Invisibility Period — time the oldest unpushed commit has been sitting unpropagated). This is the flagship operator-machine signal: it joins local git ahead/behind/dirty state with the operator's Claude session history, neither of which is accessible to GitHub Agentic Workflows or any server-side observability layer. Read-only; does not push, fetch, or mutate repos. See planning/drafts/agent-push-leakage.md for the underlying metrics and paper/main.tex §5.4 for the empirical vignette.",
      inputSchema: {
        roots: z
          .array(z.string())
          .optional()
          .describe("Absolute roots to scan. Defaults to ~/IdeaProjects."),
        thresholdDays: z
          .number()
          .int()
          .min(1)
          .max(365)
          .optional()
          .describe("Days threshold for the leakage classifier (MIP). Defaults to 7."),
        top: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Number of leaking repos to return, sorted by MIP desc. Defaults to 20."),
        pathFilter: z
          .string()
          .optional()
          .describe(
            "Substring filter on the encoded ~/.claude/projects directory name (e.g. 'IdeaProjects'). Reduces scan time on large transcript caches.",
          ),
      },
    },
    async ({ roots, thresholdDays, top, pathFilter }, extra) => {
      const scanRoots = (roots && roots.length > 0 ? roots : [join(homedir(), "IdeaProjects")]).map(
        (r) => r,
      );
      const sessions = scanAllSessions({ pathFilter });
      const aggregates = aggregateByRepo(sessions);
      const repos = scanRepos(scanRoots);
      const joined = joinReposWithSessions(repos, aggregates);
      const portfolio = computePortfolio(joined, thresholdDays ?? 7);
      const leaking = joined
        .filter((j) => j.ahead > 0)
        .sort((a, b) => (b.mip_seconds ?? 0) - (a.mip_seconds ?? 0))
        .slice(0, top ?? 20)
        .map((j) => ({
          repoPath: j.repoPath,
          branch: j.branch,
          ahead: j.ahead,
          behind: j.behind,
          dirtyFiles: j.dirtyFiles,
          mip: fmtDuration(j.mip_seconds),
          mip_seconds: j.mip_seconds,
          apl: fmtDuration(j.apl_seconds),
          apl_seconds: j.apl_seconds,
          classification: j.classification,
          cwdSessionCount: j.cwdSessionCount,
          crossRepoSessionCount: j.crossRepoSessionCount,
          lastSessionEndTs: j.lastSessionEndTs,
          oldestUnpushedTs: j.oldestUnpushedTs,
        }));
      return withTraceMeta(
        {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  generatedAt: portfolio.generatedAt,
                  roots: scanRoots,
                  portfolio,
                  topLeaking: leaking,
                },
                null,
                2,
              ),
            },
          ],
        },
        extra,
      );
    },
  );

  server.registerTool(
    "audit_session_leakage",
    {
      title: "Audit recent Claude sessions for unpushed work (local-only data)",
      description:
        "Inspect Claude Code CLI session transcripts modified within sinceHours (default 24) and report which repos those sessions touched, along with each repo's current ahead/dirty state. Useful for 'agent just finished, did anything leak?' checks at session boundaries. Reads ~/.claude/projects/<projectdir>/<sessionid>.jsonl directly — a data source no server-side workflow tool (including GitHub Agentic Workflows) can access. Read-only.",
      inputSchema: {
        sinceHours: z
          .number()
          .min(0.1)
          .max(720)
          .optional()
          .describe("Time window in hours. Defaults to 24."),
        root: z
          .string()
          .optional()
          .describe("Root path to also git-state-scan for joined repo info. Defaults to ~/IdeaProjects."),
        sessionId: z
          .string()
          .optional()
          .describe("Restrict to a specific session UUID (overrides sinceHours)."),
      },
    },
    async ({ sinceHours, root, sessionId }, extra) => {
      const projectsDir = join(homedir(), ".claude", "projects");
      const cutoff = Date.now() - (sinceHours ?? 24) * 60 * 60 * 1000;
      const matches: ReturnType<typeof scanSessionFile>[] = [];
      let scanned = 0;
      let projDirs: string[] = [];
      try {
        projDirs = readdirSync(projectsDir);
      } catch (e) {
        return withTraceMeta(errorResponse(`Cannot read ${projectsDir}: ${(e as Error).message}`), extra);
      }
      for (const dir of projDirs) {
        let entries: string[] = [];
        try {
          entries = readdirSync(join(projectsDir, dir));
        } catch {
          continue;
        }
        for (const entry of entries) {
          if (!entry.endsWith(".jsonl")) continue;
          if (sessionId && !entry.startsWith(sessionId)) continue;
          const fp = join(projectsDir, dir, entry);
          try {
            const st = statSync(fp);
            if (!sessionId && st.mtimeMs < cutoff) continue;
            scanned++;
            matches.push(scanSessionFile(fp));
          } catch {
            /* skip */
          }
        }
      }

      // Get current repo state for any path the matching sessions touched.
      const touchedPaths = new Set<string>();
      for (const s of matches) {
        if (s.cwd) touchedPaths.add(s.cwd);
        for (const p of s.touchedRepos) touchedPaths.add(p);
      }

      const scanRoots = root ? [root] : [join(homedir(), "IdeaProjects")];
      const allRepos = scanRepos(scanRoots);
      const repoByPath = new Map(allRepos.map((r) => [r.path, r]));
      const touchedReposState = Array.from(touchedPaths).map((p) => {
        const state = repoByPath.get(p);
        return {
          path: p,
          isKnownRepo: !!state,
          ahead: state?.ahead ?? null,
          behind: state?.behind ?? null,
          dirtyFiles: state?.dirtyFiles ?? null,
          branch: state?.branch ?? null,
          oldestUnpushedTs: state?.oldestUnpushedTs ?? null,
          unpushedSubjects: state?.unpushedSubjects ?? [],
        };
      });

      const leakingTouched = touchedReposState.filter((r) => (r.ahead ?? 0) > 0);

      return withTraceMeta(
        {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  generatedAt: new Date().toISOString(),
                  sessionId: sessionId ?? null,
                  sinceHours: sinceHours ?? 24,
                  sessionsScanned: scanned,
                  sessionsMatched: matches.length,
                  touchedRepoCount: touchedReposState.length,
                  leakingTouchedCount: leakingTouched.length,
                  leakingTouched,
                  allTouched: touchedReposState,
                  sessions: matches.map((s) => ({
                    sessionId: s.sessionId,
                    cwd: s.cwd,
                    startTs: s.startTs,
                    endTs: s.endTs,
                    bashCount: s.bashCount,
                    gitCommandCount: s.gitCommandCount,
                    pushCommandCount: s.pushCommandCount,
                    touchedRepos: s.touchedRepos,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        },
        extra,
      );
    },
  );

  server.registerTool(
    "list_recent_issues",
    {
      title: "List recent external-contributor issues across the portfolio",
      description:
        "Aggregate open issues authored by external contributors across every project configured in canary.config.ts. Filters out PRs, bot accounts, and issues authored by the repo owner / configured CANARY_SELF_LOGIN. Useful when an agent needs to answer 'did anyone open an issue I should look at?' without a manual GitHub visit.",
      inputSchema: {
        windowDays: z
          .number()
          .int()
          .min(1)
          .max(90)
          .optional()
          .describe("Days back to include. Defaults to 30."),
        top: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Number of most-recent issues to return across the portfolio. Defaults to 20."),
        projectId: z
          .string()
          .optional()
          .describe("Restrict to one project ID from canary.config.ts. If omitted, scans all configured projects."),
      },
    },
    async ({ windowDays, top, projectId }, extra) => {
      const days = windowDays ?? 30;
      const limit = top ?? 20;
      const filtered = projectId
        ? projects.filter((p) => p.id === projectId)
        : projects;
      if (projectId && filtered.length === 0) return withTraceMeta(unknownProjectError(projectId), extra);
      const repoProjects = filtered.filter((p) => p.repo);
      const digests = await Promise.all(
        repoProjects.map((p) => checkRecentIssues(p.repo!, { windowDays: days })),
      );
      const allIssues: Array<{ repo: string; number: number; title: string; url: string; author: string; createdAt: string; comments: number; labels: string[] }> = [];
      let totalExternal = 0;
      let totalSelfAuthored = 0;
      const perRepo: Array<{ repo: string; external: number; selfAuthored: number }> = [];
      for (const d of digests) {
        if (!d) continue;
        totalExternal += d.external.length;
        totalSelfAuthored += d.selfAuthored;
        perRepo.push({ repo: d.repo, external: d.external.length, selfAuthored: d.selfAuthored });
        for (const issue of d.external) {
          allIssues.push({
            repo: d.repo,
            number: issue.number,
            // Fence attacker-influenceable text (anyone can open an issue with a
            // crafted title/login) so a downstream LLM treats it as data, not
            // instructions. See mcp/untrusted.ts.
            title: fenceUntrusted(issue.title),
            url: issue.url,
            author: fenceUntrusted(issue.author),
            createdAt: issue.createdAt,
            comments: issue.comments,
            labels: issue.labels,
          });
        }
      }
      allIssues.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return withTraceMeta(
        {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  generatedAt: new Date().toISOString(),
                  windowDays: days,
                  totals: {
                    reposScanned: digests.filter(Boolean).length,
                    externalIssues: totalExternal,
                    selfAuthored: totalSelfAuthored,
                  },
                  perRepo: perRepo.sort((a, b) => b.external - a.external),
                  top: allIssues.slice(0, limit),
                },
                null,
                2,
            ),
          },
        ],
      },
      extra,
    );
    },
  );

  server.registerTool(
    "list_sessions",
    {
      title: "List local agent sessions",
      description:
        "Unified index over local AI transcript stores: Claude Code, Claude Desktop local-agent sessions, Codex active/archived sessions, Gemini CLI chats, and configured generic JSONL path lists. Returns source, title, cwd, timestamps, message/tool counts, and how many rule/config surfaces the session touched. Use this to find a session before fetching its transcript.",
      inputSchema: {
        source: z.enum(SESSION_SOURCE_VALUES).optional().describe("Restrict to one transcript source."),
        q: z.string().optional().describe("Substring filter over title and cwd."),
        flaggedOnly: z
          .boolean()
          .optional()
          .describe("Only sessions that touched rule/config surfaces. Defaults to false."),
        limit: z.number().int().min(1).max(500).optional().describe("Max rows. Defaults to 50."),
      },
    },
    async ({ source, q, flaggedOnly, limit }, extra) => {
      const index = await getSessionsIndex();
      let sessions = index.sessions;
      if (source) sessions = sessions.filter((s) => s.source === source);
      if (flaggedOnly) sessions = sessions.filter((s) => s.flaggedCount > 0);
      const needle = q?.toLowerCase();
      if (needle) {
        sessions = sessions.filter(
          (s) => s.title.toLowerCase().includes(needle) || (s.cwd ?? "").toLowerCase().includes(needle),
        );
      }
      const rows = sessions.slice(0, limit ?? 50).map((s) => ({
        // Titles are transcript-derived (user/AI authored) — fence them so a
        // crafted session title cannot instruct the downstream consumer.
        title: fenceUntrusted(s.title),
        source: s.source,
        jsonlPath: s.jsonlPath,
        cwd: s.cwd,
        firstTs: s.firstTs,
        lastTs: s.lastTs,
        userCount: s.userCount,
        assistantCount: s.assistantCount,
        toolCount: s.toolCount,
        ruleSurfaceHits: s.flaggedCount,
      }));
      return withTraceMeta(
        {
          content: [
            {
              type: "text",
              text: JSON.stringify({ total: sessions.length, shown: rows.length, sessions: rows }, null, 2),
            },
          ],
        },
        extra,
      );
    },
  );

  server.registerTool(
    "scan_friction",
    {
      title: "Scan operator friction in local sessions",
      description:
        "Deterministic operator-friction scan over local AI session transcripts. Flags user turns that push back on agent behaviour — wrong actions, unverified assertions, stalling, rule contamination, over-orchestration, repetition — with severity 1-3 and a 9-category taxonomy derived from a verified 2,630-turn / 515-finding audit (2026-07). Quotes are operator-authored transcript text and arrive fenced. Review aid, not ground truth: keyword/tone matching under- and over-catches relative to the human audit.",
      inputSchema: {
        sinceDays: z
          .number()
          .int()
          .min(1)
          .max(365)
          .optional()
          .describe("Look-back window over session activity. Defaults to 30."),
        source: z.enum(SESSION_SOURCE_VALUES).optional().describe("Restrict to one transcript source."),
        category: z
          .enum(FRICTION_CATEGORIES)
          .optional()
          .describe("Only findings in one taxonomy category."),
        minSeverity: z
          .number()
          .int()
          .min(1)
          .max(3)
          .optional()
          .describe("Drop findings below this severity (3 = rage, 2 = clear irritation, 1 = mild correction)."),
        limit: z.number().int().min(1).max(500).optional().describe("Max findings returned (most recent). Defaults to 100."),
      },
    },
    async ({ sinceDays, source, category, minSeverity, limit }, extra) => {
      const report = await scanFriction({ sinceDays, source });
      let findings = report.findings;
      if (category) findings = findings.filter((f) => f.category === category);
      if (minSeverity) findings = findings.filter((f) => f.severity >= minSeverity);
      const rows = findings.slice(-(limit ?? 100)).map((f) => ({
        ...f,
        // Operator-authored transcript text — fence so a crafted prompt cannot
        // instruct the downstream consumer.
        quote: fenceUntrusted(f.quote),
      }));
      return withTraceMeta(
        {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  sessionsScanned: report.sessionsScanned,
                  userTurnsScanned: report.userTurnsScanned,
                  totalFindings: report.findings.length,
                  shown: rows.length,
                  byCategory: report.byCategory,
                  bySeverity: report.bySeverity,
                  findings: rows,
                },
                null,
                2,
              ),
            },
          ],
        },
        extra,
      );
    },
  );

  server.registerTool(
    "get_session_transcript",
    {
      title: "Fetch one session transcript (reviewer-safe by default)",
      description:
        "Return a session transcript as text. By default the output is REDACTED for cross-session review: every assistant message is labelled as an unverified claim and self-assurance phrases are masked (deterministic; grounded in the measured reviewer-contamination incident — raw assistant prose makes a fresh reviewer inherit the reviewed session's frame). Pass redact=false only when you explicitly need the verbatim assistant prose. The whole transcript is additionally fenced as untrusted content.",
      inputSchema: {
        path: z
          .string()
          .describe("Absolute .jsonl path inside an allowed local transcript store (from list_sessions)."),
        redact: z
          .boolean()
          .optional()
          .describe("Reviewer-safe redaction. Defaults to true."),
        role: z
          .enum(["user", "assistant", "tool"])
          .optional()
          .describe("Only messages of one role."),
        maxChars: z
          .number()
          .int()
          .min(1000)
          .max(200_000)
          .optional()
          .describe("Truncate the rendered transcript to this many characters. Defaults to 30000."),
      },
    },
    async ({ path, redact, role, maxChars }, extra) => {
      if (!isAllowedTranscriptPath(path)) {
        return withTraceMeta(
          errorResponse(`Path outside the transcript stores: ${path}`),
          extra,
        );
      }
      const parsed = await parseSessionDetail(path);
      const filtered = role
        ? { ...parsed, messages: parsed.messages.filter((m) => m.role === role) }
        : parsed;
      const redacted = redact !== false;
      const detail = redacted ? redactDetail(filtered) : filtered;
      const body = renderDetailAsText(detail, { redacted, maxChars: maxChars ?? 30_000 });
      const s = parsed.summary;
      const meta = `session ${s.id} | ${s.cwd ?? "cwd?"} | ${s.firstTs ?? "?"} → ${s.lastTs ?? "?"} | ${s.userCount}u/${s.assistantCount}a/${s.toolCount}t | rule-surface hits: ${s.flaggedCount} | redacted: ${redacted}`;
      return withTraceMeta(
        {
          content: [
            {
              type: "text",
              text: `${meta}\n${UNTRUSTED_OPEN}\n${body}\n${UNTRUSTED_CLOSE}`,
            },
          ],
        },
        extra,
      );
    },
  );

  server.registerTool(
    "get_file_access",
    {
      title: "Which sessions touched which files (rule surfaces first)",
      description:
        "Inverted file-access index across all local sessions: for each path, read/write/shell counts and the sessions that touched it. Rule/config surfaces (CLAUDE.md, AGENTS.md, settings, ~/.claude, ~/.codex) sort first — the contamination-investigation view.",
      inputSchema: {
        q: z.string().optional().describe("Substring filter over paths."),
        flaggedOnly: z
          .boolean()
          .optional()
          .describe("Only rule/config surfaces. Defaults to true."),
        limit: z.number().int().min(1).max(1000).optional().describe("Max rows. Defaults to 100."),
      },
    },
    async ({ q, flaggedOnly, limit }, extra) => {
      let aggregates = await getFileAccessAggregates();
      if (flaggedOnly !== false) aggregates = aggregates.filter((a) => a.flagged);
      const needle = q?.toLowerCase();
      if (needle) aggregates = aggregates.filter((a) => a.path.toLowerCase().includes(needle));
      const rows = aggregates.slice(0, limit ?? 100).map((a) => ({
        path: a.path,
        flagged: a.flagged,
        reads: a.reads,
        writes: a.writes,
        shell: a.bash,
        sessionCount: a.sessionIds.length,
        sessionIds: a.sessionIds.slice(0, 20),
        lastTs: a.lastTs,
      }));
      return withTraceMeta(
        {
          content: [
            {
              type: "text",
              text: JSON.stringify({ total: aggregates.length, shown: rows.length, paths: rows }, null, 2),
            },
          ],
        },
        extra,
      );
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`canary mcp server fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
