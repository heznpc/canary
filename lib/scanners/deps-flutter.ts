import type { DependencyInfo } from "../types";
import { compareVersions } from "./version-utils";

const PUB_API = "https://pub.dev/api/packages";

/**
 * pubspec.yaml에서 의존성 파싱 (간이 YAML 파서)
 */
export function parsePubspecYaml(
  content: string,
): Record<string, string> | null {
  const deps: Record<string, string> = {};

  // dependencies: 섹션 추출
  const depsMatch = content.match(
    /^dependencies:\s*\n((?:[ \t]+.+\n?)*)/m,
  );
  if (!depsMatch) return null;

  const lines = depsMatch[1].split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // "http: ^1.0.0" 또는 "http: '>=1.0.0 <2.0.0'"
    const simple = trimmed.match(/^(\S+):\s*[\^~]?'?([0-9][0-9.]*)/);
    if (simple) {
      const name = simple[1];
      // flutter SDK deps 제외
      if (name === "flutter" || name === "flutter_test") continue;
      deps[name] = simple[2];
      continue;
    }

    // "flutter:" + "sdk: flutter" 블록 → 스킵 (이미 위에서 처리)
    // "name:" + path/git/sdk 서브키가 있으면 로컬 패키지로 스킵
    if (trimmed.match(/^(\S+):$/)) continue;
    if (trimmed.match(/^\s*(sdk|path|git|url):/)) continue;
  }

  return Object.keys(deps).length > 0 ? deps : null;
}

const FLUTTER_KEY_DEPS = new Set([
  "dio", "http", "provider", "riverpod", "flutter_riverpod",
  "bloc", "flutter_bloc", "get", "go_router",
  "sqflite", "hive", "shared_preferences",
  "firebase_core", "cloud_firestore", "firebase_auth",
  "supabase_flutter", "cached_network_image",
  "freezed", "json_serializable", "auto_route",
]);

export async function checkPubVersion(
  packageName: string,
  currentVersion: string,
  fetchFn: (url: string) => Promise<Response>,
): Promise<DependencyInfo | null> {
  try {
    const res = await fetchFn(`${PUB_API}/${packageName}`);
    if (!res.ok) return null;

    const data = await res.json();
    const latest = data.latest?.version as string;
    if (!latest) return null;

    const type = compareVersions(currentVersion, latest);
    const isKey = FLUTTER_KEY_DEPS.has(packageName);

    if (type === "up-to-date" && !isKey) return null;

    return { name: packageName, current: currentVersion, latest, type, isKey };
  } catch {
    return null;
  }
}

