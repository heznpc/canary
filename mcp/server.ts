#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { scanAll, scanProject } from "@/lib/scanners";
import { projects } from "@/lib/projects";
import { checkAnthropicUsage } from "@/lib/scanners/anthropic-usage";
import {
  buildScanProjectPayload,
  buildScanAllPayload,
  buildUsagePayload,
  buildUpdateActionsPayload,
} from "./adapters";

/**
 * stdio MCP server exposing canary scanners as tools. Runs out-of-process so
 * Claude Code / Claude Desktop can call `scan_project`, `scan_all`, and
 * `get_anthropic_usage` without spinning up the Next.js web app.
 *
 * Adapter functions keep the MCP DTOs decoupled from internal scanner types —
 * if a scanner's return shape changes, only adapters need updating, not this
 * transport-layer file.
 */

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
    async ({ projectId }) => {
      const project = projects.find((p) => p.id === projectId);
      if (!project) {
        return {
          content: [{ type: "text", text: `Unknown projectId: ${projectId}. Known: ${projects.map((p) => p.id).join(", ")}` }],
          isError: true,
        };
      }
      const health = await scanProject(project);
      return {
        content: [{ type: "text", text: JSON.stringify(buildScanProjectPayload(health), null, 2) }],
      };
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
    async () => {
      const data = await scanAll();
      return {
        content: [{ type: "text", text: JSON.stringify(buildScanAllPayload(data), null, 2) }],
      };
    },
  );

  server.registerTool(
    "list_update_actions",
    {
      title: "List pending dependency update actions for a project",
      description:
        "Return the concrete update commands (e.g. `pnpm up foo@1.2.3`) and changelog links for every outdated dependency in one project, grouped by severity. Use this to answer 'what should I update?' without re-running a full scan analysis.",
      inputSchema: { projectId: z.string().describe("Project ID as defined in canary.config.ts") },
    },
    async ({ projectId }) => {
      const project = projects.find((p) => p.id === projectId);
      if (!project) {
        return {
          content: [{ type: "text", text: `Unknown projectId: ${projectId}. Known: ${projects.map((p) => p.id).join(", ")}` }],
          isError: true,
        };
      }
      const health = await scanProject(project);
      return {
        content: [{ type: "text", text: JSON.stringify(buildUpdateActionsPayload(health), null, 2) }],
      };
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
    async ({ days }) => {
      const usage = await checkAnthropicUsage(days ?? 7);
      if (!usage) {
        return {
          content: [
            {
              type: "text",
              text: "ANTHROPIC_ADMIN_API_KEY is not set or the Admin API request failed. Set the env var and retry.",
            },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(buildUsagePayload(usage), null, 2) }],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`canary mcp server fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
