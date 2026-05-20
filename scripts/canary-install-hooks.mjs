#!/usr/bin/env node
/**
 * Install canary's git hooks into the current repo.
 *
 * Currently installs:
 *   - .git/hooks/pre-push → wraps scripts/canary-pre-push.mjs
 *
 * Behaviour:
 *   - If .git/hooks/pre-push already exists, refuses to overwrite unless
 *     CANARY_FORCE_INSTALL_HOOKS is set. The existing file is left intact.
 *   - The installed hook is a small shell wrapper that delegates to
 *     `node $CANARY_HOME/scripts/canary-pre-push.mjs`. We do not symlink
 *     so that uninstalling is trivial (`rm .git/hooks/pre-push`).
 *
 * Run from the canary repo:    `npm run pl:install-hooks`
 * Or from any other repo:     `node /path/to/canary/scripts/canary-install-hooks.mjs`
 */

import { existsSync, writeFileSync, chmodSync, mkdirSync } from "fs";
import { resolve, join, dirname } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

function repoRootOrNull() {
  try {
    const out = execSync("git rev-parse --show-toplevel", { stdio: ["ignore", "pipe", "ignore"] });
    return out.toString().trim();
  } catch {
    return null;
  }
}

function canaryHomeFromHook() {
  // canary-install-hooks.mjs lives at <canary-home>/scripts/.
  const here = fileURLToPath(import.meta.url);
  return resolve(dirname(here), "..");
}

function main() {
  const root = repoRootOrNull();
  if (!root) {
    console.error("[canary install-hooks] not inside a git repo — aborting");
    process.exit(1);
  }

  const canaryHome = canaryHomeFromHook();
  const hookSource = join(canaryHome, "scripts", "canary-pre-push.mjs");
  if (!existsSync(hookSource)) {
    console.error(`[canary install-hooks] expected hook script at ${hookSource} — aborting`);
    process.exit(1);
  }

  const hooksDir = join(root, ".git", "hooks");
  mkdirSync(hooksDir, { recursive: true });
  const target = join(hooksDir, "pre-push");

  const force = process.env.CANARY_FORCE_INSTALL_HOOKS === "1";
  if (existsSync(target) && !force) {
    console.error(`[canary install-hooks] ${target} already exists — refusing to overwrite`);
    console.error("[canary install-hooks] set CANARY_FORCE_INSTALL_HOOKS=1 to replace");
    process.exit(2);
  }

  const wrapper =
    "#!/bin/sh\n" +
    "# canary pre-push hook — informational, never blocks.\n" +
    `# Source: ${hookSource}\n` +
    "# Uninstall: rm .git/hooks/pre-push\n" +
    `CANARY_HOME="${canaryHome}" node "${hookSource}" "$@" || true\n` +
    "exit 0\n";

  writeFileSync(target, wrapper);
  chmodSync(target, 0o755);

  console.error(`[canary install-hooks] installed ${target}`);
  console.error("[canary install-hooks] next push in this repo will surface portfolio leakage state.");
}

main();
