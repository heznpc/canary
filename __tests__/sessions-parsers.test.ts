import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { parseClaudeDetail, scanClaudeSession } from "../lib/sessions/claude";
import { parseCodexDetail, scanCodexSession } from "../lib/sessions/codex";
import { getSessionsIndex, isAllowedTranscriptPath, isCodexTranscriptPath, parseSessionDetail } from "../lib/sessions/scan";
import { extractPathsFromCommand, isRuleSurface } from "../lib/sessions/types";

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function tmpJsonl(name: string, lines: unknown[]): string {
  const dir = mkdtempSync(join(tmpdir(), "canary-sessions-"));
  const path = join(dir, name);
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return path;
}

describe("isRuleSurface", () => {
  it("flags rule/config basenames and agent config dirs", () => {
    expect(isRuleSurface("/Users/x/IdeaProjects/foo/CLAUDE.md")).toBe(true);
    expect(isRuleSurface("/Users/x/.claude/settings.json")).toBe(true);
    expect(isRuleSurface("/Users/x/.codex/config.toml")).toBe(true);
    expect(isRuleSurface("/Users/x/IdeaProjects/foo/src/index.ts")).toBe(false);
  });
});

describe("extractPathsFromCommand", () => {
  it("extracts absolute and home paths, skips URLs", () => {
    const paths = extractPathsFromCommand(
      'cat ~/.claude/CLAUDE.md && curl https://example.com/x && ls "/tmp/dir name"',
    );
    // Exact expectation: the URL must contribute nothing; the quoted path is
    // cut at the space by design (heuristic extractor).
    expect(new Set(paths)).toEqual(new Set(["~/.claude/CLAUDE.md", "/tmp/dir"]));
  });
});

describe("claude parser", () => {
  const lines = [
    { type: "summary", summary: "Fix the login bug" },
    {
      type: "user",
      timestamp: "2026-07-01T10:00:00.000Z",
      cwd: "/Users/x/proj",
      gitBranch: "main",
      sessionId: "abc",
      message: { role: "user", content: "please fix login" },
    },
    {
      type: "assistant",
      timestamp: "2026-07-01T10:00:05.000Z",
      message: {
        id: "msg_1",
        role: "assistant",
        content: [
          { type: "text", text: "reading the rule file first" },
          { type: "tool_use", name: "Read", input: { file_path: "/Users/x/proj/CLAUDE.md" } },
          { type: "tool_use", name: "Bash", input: { command: "git -C /Users/x/proj status" } },
        ],
      },
    },
    // Duplicated streamed write of the same block — must dedupe at block level.
    {
      type: "assistant",
      timestamp: "2026-07-01T10:00:05.000Z",
      message: {
        id: "msg_1",
        role: "assistant",
        content: [{ type: "tool_use", name: "Read", input: { file_path: "/Users/x/proj/CLAUDE.md" } }],
      },
    },
    // Block-split streamed line: SAME message.id, NEW block — must NOT be dropped.
    {
      type: "assistant",
      timestamp: "2026-07-01T10:00:06.000Z",
      message: {
        id: "msg_1",
        role: "assistant",
        content: [
          { type: "tool_use", id: "toolu_grep1", name: "Grep", input: { pattern: "login", path: "/Users/x/proj" } },
        ],
      },
    },
    { type: "file-history-snapshot", timestamp: "2026-07-01T10:00:06.000Z" },
  ];

  it("builds a summary with dedupe, title, counts, and flagged access", async () => {
    const path = tmpJsonl("11111111-2222-3333-4444-555555555555.jsonl", lines);
    const { summary, fileAccess } = await scanClaudeSession(path);
    expect(summary.id).toBe("claude:11111111-2222-3333-4444-555555555555");
    expect(summary.title).toBe("Fix the login bug");
    expect(summary.cwd).toBe("/Users/x/proj");
    expect(summary.userCount).toBe(1);
    expect(summary.assistantCount).toBe(1); // one message.id = one turn, however many lines
    expect(summary.toolCount).toBe(3); // Read + Bash + block-split Grep; duplicate Read dropped
    expect(fileAccess.some((e) => e.op === "read" && e.flagged)).toBe(true);
    expect(summary.flaggedCount).toBeGreaterThanOrEqual(1);
  });

  it("produces an interleaved detail timeline", async () => {
    const path = tmpJsonl("22222222-2222-3333-4444-555555555555.jsonl", lines);
    const detail = await parseClaudeDetail(path);
    const roles = detail.messages.map((m) => m.role);
    expect(roles).toEqual(["user", "assistant", "tool", "tool", "tool"]);
    expect(detail.messages[2].toolName).toBe("Read");
    expect(detail.messages[4].toolName).toBe("Grep"); // block-split line preserved
  });
});

describe("codex parser", () => {
  const lines = [
    {
      timestamp: "2026-06-25T07:30:14.000Z",
      type: "session_meta",
      payload: { id: "019e-abc", cwd: "/Users/x/proj", originator: "Codex Desktop" },
    },
    {
      timestamp: "2026-06-25T07:30:20.000Z",
      type: "event_msg",
      payload: { type: "user_message", message: "audit this repo" },
    },
    {
      timestamp: "2026-06-25T07:30:30.000Z",
      type: "response_item",
      payload: {
        type: "function_call",
        name: "exec_command",
        arguments: JSON.stringify({ cmd: "cat /Users/x/proj/AGENTS.md", workdir: "/Users/x/proj" }),
      },
    },
    {
      timestamp: "2026-06-25T07:30:40.000Z",
      type: "event_msg",
      payload: { type: "agent_message", message: "done — the file looks clean" },
    },
    {
      timestamp: "2026-06-25T07:30:41.000Z",
      type: "event_msg",
      payload: { type: "token_count", info: {} },
    },
  ];

  it("builds a summary from session_meta and event stream", async () => {
    const path = tmpJsonl("rollout-2026-06-25T07-30-14-019e-abc.jsonl", lines);
    const { summary, fileAccess } = await scanCodexSession(path);
    expect(summary.id).toBe("codex:019e-abc");
    expect(summary.cwd).toBe("/Users/x/proj");
    expect(summary.originator).toBe("Codex Desktop");
    expect(summary.title).toBe("audit this repo");
    expect(summary.userCount).toBe(1);
    expect(summary.assistantCount).toBe(1);
    expect(summary.toolCount).toBe(1);
    expect(fileAccess.some((e) => e.path === "/Users/x/proj/AGENTS.md" && e.flagged)).toBe(true);
  });

  it("produces a timeline with tool calls between messages", async () => {
    const path = tmpJsonl("rollout-2026-06-25T07-30-14-019e-def.jsonl", lines);
    const detail = await parseCodexDetail(path);
    const roles = detail.messages.map((m) => m.role);
    expect(roles).toEqual(["user", "tool", "assistant"]);
    expect(detail.messages[1].paths).toContain("/Users/x/proj/AGENTS.md");
  });
});

describe("session scanner roots", () => {
  it("indexes all configured local AI transcript sources", async () => {
    const root = mkdtempSync(join(tmpdir(), "canary-session-roots-"));
    const claudeProject = join(root, "claude-projects", "-Users-x-proj");
    const codexDay = join(root, "codex-sessions", "2026", "07", "08");
    const codexArchive = join(root, "codex-archived");
    const geminiChats = join(root, "gemini", "sample-project", "chats");
    const claudeDesktop = join(root, "Claude", "local-agent-mode-sessions", "local-1");
    const listedOnly = join(root, "listed-only");
    mkdirSync(claudeProject, { recursive: true });
    mkdirSync(codexDay, { recursive: true });
    mkdirSync(codexArchive, { recursive: true });
    mkdirSync(geminiChats, { recursive: true });
    mkdirSync(claudeDesktop, { recursive: true });
    mkdirSync(listedOnly, { recursive: true });

    const claudePath = join(claudeProject, "11111111-2222-3333-4444-555555555555.jsonl");
    const nestedClaudeDir = join(claudeProject, "22222222-2222-3333-4444-555555555555");
    mkdirSync(nestedClaudeDir, { recursive: true });
    const nestedClaudePath = join(nestedClaudeDir, "33333333-3333-3333-3333-555555555555.jsonl");
    writeFileSync(
      claudePath,
      JSON.stringify({
        type: "user",
        timestamp: "2026-07-08T00:00:00.000Z",
        cwd: "/Users/x/proj",
        message: { role: "user", content: "review this" },
      }) + "\n",
    );
    writeFileSync(
      nestedClaudePath,
      JSON.stringify({
        type: "user",
        timestamp: "2026-07-08T00:00:02.000Z",
        cwd: "/Users/x/proj",
        message: { role: "user", content: "nested review" },
      }) + "\n",
    );

    const codexActivePath = join(codexDay, "rollout-2026-07-08-active.jsonl");
    const codexArchivePath = join(codexArchive, "rollout-2026-07-08-archived.jsonl");
    const codexLines = (id: string) =>
      [
        {
          timestamp: "2026-07-08T00:00:00.000Z",
          type: "session_meta",
          payload: { id, cwd: "/Users/x/proj", originator: "Codex Desktop" },
        },
        {
          timestamp: "2026-07-08T00:00:01.000Z",
          type: "event_msg",
          payload: { type: "user_message", message: "audit this repo" },
        },
      ]
        .map((line) => JSON.stringify(line))
        .join("\n") + "\n";
    writeFileSync(codexActivePath, codexLines("active-session"));
    writeFileSync(codexArchivePath, codexLines("archived-session"));

    const geminiPath = join(geminiChats, "session-2026-07-08-gemini.jsonl");
    writeFileSync(
      geminiPath,
      [
        { sessionId: "gemini-session", startTime: "2026-07-08T00:00:00.000Z", kind: "main" },
        { id: "u1", timestamp: "2026-07-08T00:00:01.000Z", type: "user", content: "find context" },
        { id: "m1", timestamp: "2026-07-08T00:00:02.000Z", type: "gemini", content: "context found" },
      ]
        .map((line) => JSON.stringify(line))
        .join("\n") + "\n",
    );

    const desktopPath = join(claudeDesktop, "desktop-session.jsonl");
    writeFileSync(
      desktopPath,
      [
        {
          type: "user",
          sessionId: "desktop-session",
          timestamp: "2026-07-08T00:00:03.000Z",
          cwd: "/Users/x/desktop-proj",
          message: { role: "user", content: "desktop request" },
        },
        {
          type: "assistant",
          sessionId: "desktop-session",
          timestamp: "2026-07-08T00:00:04.000Z",
          message: { role: "assistant", content: "desktop answer" },
        },
      ]
        .map((line) => JSON.stringify(line))
        .join("\n") + "\n",
    );

    const genericPath = join(listedOnly, "other-agent.jsonl");
    writeFileSync(
      genericPath,
      [
        { id: "generic-session", timestamp: "2026-07-08T00:00:05.000Z", type: "user", content: "generic request" },
        { id: "generic-session", timestamp: "2026-07-08T00:00:06.000Z", type: "assistant", content: "generic answer" },
      ]
        .map((line) => JSON.stringify(line))
        .join("\n") + "\n",
    );
    const listFile = join(root, "list_ALL-ai-conversations.txt");
    writeFileSync(listFile, `${genericPath}\n`);

    const oldClaudeDir = process.env.CANARY_CLAUDE_DIR;
    const oldCodexDir = process.env.CANARY_CODEX_DIR;
    const oldCodexArchiveDir = process.env.CANARY_CODEX_ARCHIVE_DIR;
    const oldGeminiDir = process.env.CANARY_GEMINI_DIR;
    const oldClaudeDesktopDir = process.env.CANARY_CLAUDE_DESKTOP_DIR;
    const oldListFiles = process.env.CANARY_SESSION_LIST_FILES;
    try {
      process.env.CANARY_CLAUDE_DIR = join(root, "claude-projects");
      process.env.CANARY_CODEX_DIR = join(root, "codex-sessions");
      process.env.CANARY_CODEX_ARCHIVE_DIR = codexArchive;
      process.env.CANARY_GEMINI_DIR = join(root, "gemini");
      process.env.CANARY_CLAUDE_DESKTOP_DIR = join(root, "Claude", "local-agent-mode-sessions");
      process.env.CANARY_SESSION_LIST_FILES = listFile;

      const index = await getSessionsIndex(true);
      expect(index.fileCount).toBe(7);
      expect(index.sessions.map((s) => s.id).sort()).toEqual([
        "claude-desktop:desktop-session",
        "claude:11111111-2222-3333-4444-555555555555",
        "claude:33333333-3333-3333-3333-555555555555",
        "codex:active-session",
        "codex:archived-session",
        "gemini:gemini-session",
        "generic:generic-session",
      ]);
      expect(isAllowedTranscriptPath(codexArchivePath)).toBe(true);
      expect(isAllowedTranscriptPath(genericPath)).toBe(true);
      expect(isCodexTranscriptPath(codexArchivePath)).toBe(true);
      const geminiDetail = await parseSessionDetail(geminiPath);
      expect(geminiDetail.summary.source).toBe("gemini");
      const desktopDetail = await parseSessionDetail(desktopPath);
      expect(desktopDetail.summary.source).toBe("claude-desktop");
      const genericDetail = await parseSessionDetail(genericPath);
      expect(genericDetail.summary.source).toBe("generic");
      expect(genericDetail.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    } finally {
      restoreEnv("CANARY_CLAUDE_DIR", oldClaudeDir);
      restoreEnv("CANARY_CODEX_DIR", oldCodexDir);
      restoreEnv("CANARY_CODEX_ARCHIVE_DIR", oldCodexArchiveDir);
      restoreEnv("CANARY_GEMINI_DIR", oldGeminiDir);
      restoreEnv("CANARY_CLAUDE_DESKTOP_DIR", oldClaudeDesktopDir);
      restoreEnv("CANARY_SESSION_LIST_FILES", oldListFiles);
    }
  });
});
