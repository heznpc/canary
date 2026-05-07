#!/usr/bin/env node
/**
 * Smoke-test the bundled MCP server:
 *   1. spawn `node mcp/dist/server.mjs`
 *   2. send `initialize` + `tools/list`
 *   3. assert every expected tool is registered and the init handshake succeeds
 *
 * A scanner refactor that silently drops or renames a tool will fail here
 * before shipping — CI treats any missing tool as a non-zero exit.
 */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_TOOLS = [
  "scan_project",
  "scan_all",
  "list_update_actions",
  "get_anthropic_usage",
  "list_leaking_repos",
  "audit_session_leakage",
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = path.join(root, "mcp/dist/server.mjs");

const child = spawn(process.execPath, [bundlePath], {
  stdio: ["pipe", "pipe", "inherit"],
  cwd: root,
});

const rl = createInterface({ input: child.stdout });
const responses = new Map();
rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    if (typeof msg.id === "number") responses.set(msg.id, msg);
  } catch {
    // Non-JSON chatter; stderr-style logs are passed through directly.
  }
});

function send(obj) {
  child.stdin.write(JSON.stringify(obj) + "\n");
}

async function waitFor(id, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (responses.has(id)) return responses.get(id);
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out waiting for response id=${id}`);
}

function fail(msg) {
  console.error(`[mcp-smoke] FAIL: ${msg}`);
  child.kill();
  process.exit(1);
}

try {
  send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "canary-smoke", version: "0.0.0" },
    },
  });
  const init = await waitFor(1);
  if (!init.result?.serverInfo?.name) fail("initialize did not return serverInfo.name");

  send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });

  send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const toolsResp = await waitFor(2);
  const got = (toolsResp.result?.tools ?? []).map((t) => t.name).sort();
  const want = [...EXPECTED_TOOLS].sort();
  const missing = want.filter((n) => !got.includes(n));
  const unexpected = got.filter((n) => !want.includes(n));
  if (missing.length || unexpected.length) {
    fail(
      `tools mismatch — missing=[${missing.join(",")}] unexpected=[${unexpected.join(",")}] got=[${got.join(",")}]`,
    );
  }

  // Exercise a handler so `tools/list` registration alone can't mask a broken
  // adapter. We use an unknown projectId so no network calls happen — the
  // server should respond with isError + a "Unknown projectId" message.
  send({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "list_update_actions", arguments: { projectId: "__nonexistent_smoke_id__" } },
  });
  const callResp = await waitFor(3);
  if (!callResp.result?.isError) {
    fail("expected isError=true for unknown projectId, got: " + JSON.stringify(callResp.result));
  }
  const text = callResp.result?.content?.[0]?.text ?? "";
  if (!text.includes("Unknown projectId")) {
    fail(`expected error text to mention 'Unknown projectId', got: ${text.slice(0, 200)}`);
  }

  console.log(`[mcp-smoke] OK — ${got.length} tools registered, handler reachable: ${got.join(", ")}`);
} finally {
  child.kill();
  await Promise.race([once(child, "exit"), new Promise((r) => setTimeout(r, 1000))]);
}
