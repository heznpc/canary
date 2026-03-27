import type { DependencyInfo, DependencyHealth } from "../types";
import { compareVersions } from "./version-utils";

const PYPI_API = "https://pypi.org/pypi";

interface ManifestResult {
  deps: Record<string, string>; // name → version spec
  packageManager: DependencyHealth["packageManager"];
}

/**
 * pyproject.toml 또는 requirements.txt에서 의존성 파싱
 */
export function parsePythonManifest(
  content: string,
  filename: string,
): ManifestResult | null {
  if (filename === "pyproject.toml") {
    return parsePyprojectToml(content);
  }
  if (filename === "requirements.txt") {
    return parseRequirementsTxt(content);
  }
  return null;
}

function parsePyprojectToml(content: string): ManifestResult | null {
  const deps: Record<string, string> = {};

  // [tool.poetry.dependencies] 형식
  const poetryMatch = content.match(
    /\[tool\.poetry\.dependencies\]([\s\S]*?)(?=\n\[|$)/,
  );
  if (poetryMatch) {
    const lines = poetryMatch[1].split("\n");
    for (const line of lines) {
      const m = line.match(/^(\S+)\s*=\s*"([^"]+)"/);
      if (m && m[1] !== "python") {
        deps[m[1]] = m[2];
      }
    }
    if (Object.keys(deps).length > 0) {
      return { deps, packageManager: "poetry" };
    }
  }

  // [project].dependencies 형식 (PEP 621)
  const projectMatch = content.match(
    /\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/,
  );
  if (projectMatch) {
    const items = projectMatch[1].match(/"([^"]+)"/g);
    if (items) {
      for (const item of items) {
        const raw = item.replace(/"/g, "");
        const parsed = parseRequirementSpec(raw);
        if (parsed) deps[parsed.name] = parsed.version;
      }
    }
  }

  // uv 감지: [tool.uv] 섹션 존재 여부
  const hasUv = /\[tool\.uv\]/.test(content);
  const pm = hasUv ? "uv" : "pip";

  return Object.keys(deps).length > 0 ? { deps, packageManager: pm } : null;
}

function parseRequirementsTxt(content: string): ManifestResult | null {
  const deps: Record<string, string> = {};
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;

    const parsed = parseRequirementSpec(trimmed);
    if (parsed) deps[parsed.name] = parsed.version;
  }

  return Object.keys(deps).length > 0
    ? { deps, packageManager: "pip" }
    : null;
}

function parseRequirementSpec(
  spec: string,
): { name: string; version: string } | null {
  // "flask>=2.0", "requests==2.28.1", "django~=4.2"
  const m = spec.match(/^([a-zA-Z0-9_-]+(?:\[[^\]]*\])?)\s*([><=~!]+)\s*(.+?)(?:\s*[,;].*)?$/);
  if (m) return { name: m[1].replace(/\[.*\]/, ""), version: m[3].trim() };

  // 버전 없이 패키지명만
  const nameOnly = spec.match(/^([a-zA-Z0-9_-]+)/);
  if (nameOnly) return { name: nameOnly[1], version: "*" };

  return null;
}

const PYTHON_KEY_DEPS = new Set([
  "django", "flask", "fastapi", "starlette",
  "numpy", "pandas", "scipy", "scikit-learn",
  "torch", "pytorch", "tensorflow", "transformers",
  "langchain", "openai", "anthropic",
  "sqlalchemy", "pydantic", "celery",
  "pytest", "uvicorn", "gunicorn",
]);

export async function checkPypiVersion(
  packageName: string,
  currentSpec: string,
  fetchFn: (url: string) => Promise<Response>,
): Promise<DependencyInfo | null> {
  try {
    const res = await fetchFn(`${PYPI_API}/${packageName}/json`);
    if (!res.ok) return null;

    const data = await res.json();
    const latest = data.info?.version as string;
    if (!latest) return null;

    const current = currentSpec.replace(/^[><=~!]+/, "").trim();
    if (current === "*") {
      return {
        name: packageName,
        current: "unspecified",
        latest,
        type: "minor",
        isKey: PYTHON_KEY_DEPS.has(packageName.toLowerCase()),
      };
    }

    const type = compareVersions(current, latest);
    const isKey = PYTHON_KEY_DEPS.has(packageName.toLowerCase());

    if (type === "up-to-date" && !isKey) return null;

    return { name: packageName, current, latest, type, isKey };
  } catch {
    return null;
  }
}

