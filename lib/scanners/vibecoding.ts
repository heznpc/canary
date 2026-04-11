import type { VibeCodingIntel } from "../types";
import type { StackType } from "../projects";
import { fetchWithTimeout, parseRepoSlug } from "./version-utils";
import stackIntelData from "../data/stack-intel.json";

/**
 * 프로젝트의 바이브코딩 인텔 수집
 */
export async function analyzeVibeCoding(
  repo: string | undefined,
  stackTypes: StackType[],
  stackVersions: Record<string, string>
): Promise<VibeCodingIntel> {
  const [hasAgentsMd, hasClaudeMd] = repo
    ? await Promise.all([
        checkFileExists(repo, "AGENTS.md"),
        checkFileExists(repo, "CLAUDE.md"),
      ])
    : [false, false];

  const gotchas: string[] = [];
  const tips: string[] = [];

  // 스택별 고려사항 수집
  for (const st of stackTypes) {
    const version = stackVersions[st] ?? null;
    const intel = getStackIntel(st, version);
    gotchas.push(...intel.gotchas);
    tips.push(...intel.tips);
  }

  // AGENTS.md / CLAUDE.md 관련 팁
  if (!hasAgentsMd && !hasClaudeMd) {
    tips.push(
      "AGENTS.md 또는 CLAUDE.md를 추가하면 AI가 프로젝트 컨벤션을 자동으로 인식합니다"
    );
  } else if (hasAgentsMd && !hasClaudeMd) {
    tips.push("AGENTS.md 감지됨 — AI 코딩 시 프로젝트 컨텍스트 활용 가능");
  } else if (hasClaudeMd) {
    tips.push(
      "CLAUDE.md 감지됨 — Claude Code가 프로젝트 지침을 자동으로 따릅니다"
    );
  }

  return { hasAgentsMd, hasClaudeMd, gotchas, tips };
}

async function checkFileExists(
  repo: string,
  filename: string
): Promise<boolean> {
  try {
    const parsed = parseRepoSlug(repo);
    if (!parsed) return false;
    const res = await fetchWithTimeout(
      `https://raw.githubusercontent.com/${parsed.owner}/${parsed.name}/HEAD/${filename}`
    );
    if (res.ok) res.body?.cancel(); // connection 재사용을 위해 body drain
    return res.ok;
  } catch {
    return false;
  }
}

interface StackIntel {
  gotchas: string[];
  tips: string[];
}

interface StackIntelEntry {
  general?: Partial<StackIntel>;
  versions?: Record<string, Partial<StackIntel>>;
}

const STACK_INTEL_DB = stackIntelData as Record<string, StackIntelEntry>;

function getStackIntel(
  stack: StackType,
  currentVersion: string | null
): StackIntel {
  const db = STACK_INTEL_DB[stack];
  if (!db) return { gotchas: [], tips: [] };

  const gotchas: string[] = [];
  const tips: string[] = [];

  // 일반 고려사항
  if (db.general) {
    gotchas.push(...(db.general.gotchas ?? []));
    tips.push(...(db.general.tips ?? []));
  }

  // 현재 사용 중인 메이저 버전의 고려사항만 표시 (하위 버전 gotcha 누적 방지)
  if (currentVersion && db.versions) {
    const major = parseInt(currentVersion.split(".")[0], 10);
    const majorStr = String(major);
    const intel = db.versions[majorStr];
    if (intel) {
      gotchas.push(...(intel.gotchas ?? []));
      tips.push(...(intel.tips ?? []));
    }
  }

  return { gotchas, tips };
}
