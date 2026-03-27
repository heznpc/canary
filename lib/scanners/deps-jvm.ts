import type { DependencyInfo } from "../types";
import { compareVersions } from "./version-utils";

const MAVEN_SEARCH = "https://search.maven.org/solrsearch/select";

interface JvmDep {
  group: string;
  artifact: string;
  version: string;
}

/**
 * build.gradle / build.gradle.kts에서 의존성 파싱
 */
export function parseGradle(content: string): JvmDep[] {
  const deps: JvmDep[] = [];

  // Groovy: implementation 'g:a:v' / Kotlin: implementation("g:a:v")
  const pattern =
    /(?:implementation|api|compileOnly|runtimeOnly|testImplementation)\s*[('"]\s*["']?([^'"():]+):([^'"():]+):([^'"()]+?)["')]/g;

  let match;
  while ((match = pattern.exec(content)) !== null) {
    deps.push({
      group: match[1].trim(),
      artifact: match[2].trim(),
      version: match[3].trim().replace(/["']/g, ""),
    });
  }

  const seen = new Set<string>();
  return deps.filter((d) => {
    if (!(/^\d/.test(d.version))) return false;
    const key = `${d.group}:${d.artifact}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * pom.xml에서 의존성 파싱 (간이 XML 파서)
 */
export function parsePomXml(content: string): JvmDep[] {
  const deps: JvmDep[] = [];

  const depBlocks = content.match(/<dependency>([\s\S]*?)<\/dependency>/g);
  if (!depBlocks) return deps;

  for (const block of depBlocks) {
    const group = block.match(/<groupId>([^<]+)<\/groupId>/)?.[1];
    const artifact = block.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1];
    const version = block.match(/<version>([^<$]+)<\/version>/)?.[1];

    if (group && artifact && version && /^\d/.test(version)) {
      deps.push({ group, artifact, version });
    }
  }

  return deps;
}

const JVM_KEY_GROUPS = new Set([
  "org.springframework.boot",
  "org.springframework",
  "org.springframework.security",
  "org.springframework.data",
  "io.projectreactor",
  "org.jetbrains.kotlin",
  "com.google.firebase",
  "com.squareup.okhttp3",
  "com.squareup.retrofit2",
  "io.ktor",
  "org.mybatis.spring.boot",
  "com.zaxxer", // HikariCP
]);

export async function checkMavenVersion(
  dep: JvmDep,
  fetchFn: (url: string) => Promise<Response>,
): Promise<DependencyInfo | null> {
  try {
    const params = new URLSearchParams({
      q: `g:${dep.group} AND a:${dep.artifact}`,
      rows: "1",
      wt: "json",
    });

    const res = await fetchFn(`${MAVEN_SEARCH}?${params}`);
    if (!res.ok) return null;

    const data = await res.json();
    const doc = data.response?.docs?.[0];
    if (!doc) return null;

    const latest = doc.latestVersion as string;
    if (!latest) return null;

    const type = compareVersions(dep.version, latest, true);
    const isKey = JVM_KEY_GROUPS.has(dep.group);
    const name = `${dep.group}:${dep.artifact}`;

    if (type === "up-to-date" && !isKey) return null;

    return { name, current: dep.version, latest, type, isKey };
  } catch {
    return null;
  }
}

