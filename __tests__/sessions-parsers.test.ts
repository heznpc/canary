import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { parseClaudeDetail, scanClaudeSession } from "../lib/sessions/claude";
import { parseCodexDetail, scanCodexSession } from "../lib/sessions/codex";
import { extractPathsFromCommand, isRuleSurface } from "../lib/sessions/types";

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
