import type { VibeCodingIntel } from "../types";
import type { StackType } from "../projects";
import { fetchWithTimeout, parseRepoSlug } from "./version-utils";

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

const STACK_INTEL_DB: Record<
  string,
  {
    general?: Partial<StackIntel>;
    versions?: Record<string, Partial<StackIntel>>;
  }
> = {
  nextjs: {
    general: {
      tips: [
        "node_modules/next/dist/docs/에 최신 공식 문서가 포함되어 있습니다 — AGENTS.md에 참조 추가 권장",
      ],
    },
    versions: {
      "16": {
        gotchas: [
          "Next.js 16: cookies(), headers(), params, searchParams가 비동기 전용 — await 필수",
          "Next.js 16: Turbopack이 기본 번들러 — --turbopack 플래그 불필요",
          "Next.js 16: 'use cache' 디렉티브로 캐싱 모델 변경됨 — dynamic/revalidate 설정 방식 다름",
          "Next.js 16: AI가 Pages Router 패턴(getServerSideProps 등)을 생성할 수 있음 — App Router만 사용",
        ],
        tips: [
          "AGENTS.md에 'Next.js 16 App Router 전용, Pages Router 사용 금지' 명시 권장",
        ],
      },
      "15": {
        gotchas: [
          "Next.js 15: fetch 기본 캐싱이 'no-store'로 변경됨 — 이전 버전과 동작이 다름",
          "Next.js 15: AI가 13/14 시절의 캐싱 패턴을 제안할 수 있음 — revalidate 설정 확인 필요",
        ],
      },
    },
  },
  react: {
    versions: {
      "19": {
        gotchas: [
          "React 19: ref가 일반 prop으로 전달됨 — forwardRef() 불필요 (AI가 여전히 생성할 수 있음)",
          "React 19: use() 훅 추가 — Promise/Context를 직접 읽을 수 있음",
          "React 19: <form> action 프로퍼티로 서버 액션 직접 연결 가능",
        ],
        tips: [
          "forwardRef 대신 ref를 직접 prop으로 전달하세요",
        ],
      },
      "18": {
        gotchas: [
          "React 18: useEffect가 Strict Mode에서 두 번 실행됨 — AI가 이걸 버그로 오진단할 수 있음",
        ],
      },
    },
  },
  flutter: {
    general: {
      gotchas: [
        "Flutter: AI가 deprecated된 위젯(FlatButton, RaisedButton 등)을 생성할 수 있음",
        "Flutter: null safety 마이그레이션 상태 확인 필요",
      ],
      tips: [
        "pubspec.yaml의 SDK 제약 조건을 AGENTS.md에 명시하면 AI가 호환되는 API만 사용합니다",
      ],
    },
    versions: {
      "3": {
        gotchas: [
          "Flutter 3: Material 3 기본 활성화 — AI가 Material 2 스타일을 생성할 수 있음",
          "Flutter 3.x: Dart 3의 패턴 매칭, sealed class 등 새 문법 활용 가능",
        ],
      },
    },
  },
  "spring-boot": {
    versions: {
      "3": {
        gotchas: [
          "Spring Boot 3: Java 17+ 필수, javax.* → jakarta.* 네임스페이스 변경",
          "Spring Boot 3: AI가 javax 임포트를 생성할 수 있음 — jakarta로 교체 필요",
        ],
      },
    },
  },
  python: {
    general: {
      gotchas: [
        "Python: AI가 f-string 이전 스타일(.format, %)을 혼용할 수 있음",
      ],
    },
    versions: {
      "3": {
        gotchas: [
          "Python 3.12+: 새로운 타입 힌트 문법 (type X = ...) 사용 가능",
        ],
      },
    },
  },
  typescript: {
    versions: {
      "5": {
        gotchas: [
          "TypeScript 5: decorators가 TC39 표준으로 변경 — experimentalDecorators와 다름",
          "TypeScript 5.5+: isolatedDeclarations 옵션 추가",
        ],
        tips: [
          "satisfies 연산자를 활용하면 타입 안전성과 추론을 동시에 확보할 수 있음",
        ],
      },
    },
  },
  "chrome-extension": {
    general: {
      gotchas: [
        "Chrome Extension: Manifest V2는 Chrome Web Store에서 더 이상 신규 등록 불가",
        "AI가 Manifest V2 패턴(background.scripts 등)을 생성할 수 있음 — V3 service worker 사용 필요",
      ],
    },
  },
  node: {
    versions: {
      "22": {
        tips: [
          "Node 22: 네이티브 .env 파일 로드, watch 모드, WebSocket 클라이언트 내장",
        ],
      },
      "20": {
        gotchas: [
          "Node 20: 이전 LTS(16, 18)에서 마이그레이션 시 fetch API가 내장됨 — node-fetch 불필요",
        ],
      },
    },
  },
};
