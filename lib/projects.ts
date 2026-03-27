export type ProjectTag = "active" | "maintenance" | "archived" | "prototype" | "research";
export type DeployTarget = "vercel" | "npm" | "chrome-store" | "github-pages" | "zenodo" | "docker" | "mobile" | "none";
export type StackType = "nextjs" | "react" | "flutter" | "spring-boot" | "python" | "vanilla-js" | "latex" | "typescript" | "chrome-extension" | "node";

export interface ProjectConfig {
  id: string;
  name: string;
  description: string;
  repo?: string; // GitHub owner/repo
  tag: ProjectTag;
  stack: StackType[];
  deployTarget: DeployTarget;
  deployUrl?: string;
  npmPackage?: string;
  category: "app" | "paper" | "mcp" | "infra";
}

export const projects: ProjectConfig[] = [
  // ── App ──
  {
    id: "aegis",
    name: "AEGIS",
    description: "CCTV AI 모니터링 시스템 (Next.js + Spring Boot + Python)",
    tag: "prototype",
    stack: ["nextjs", "spring-boot", "python"],
    deployTarget: "docker",
    category: "app",
  },
  {
    id: "dol-pin",
    name: "Dol-Pin",
    description: "K-pop 콘서트 아이템 렌탈 마켓플레이스 (Flutter + Supabase)",
    tag: "prototype",
    stack: ["flutter"],
    deployTarget: "mobile",
    category: "app",
  },
  {
    id: "followprint",
    name: "FollowPrint",
    description: "인쇄/스크린샷 추적 유틸리티",
    repo: "heznpc/FollowPrint",
    tag: "active",
    stack: ["nextjs"],
    deployTarget: "none",
    category: "app",
  },
  {
    id: "gallery",
    name: "Gallery",
    description: "아트 갤러리 정적 사이트",
    repo: "heznpc/gallery",
    tag: "maintenance",
    stack: ["vanilla-js"],
    deployTarget: "github-pages",
    deployUrl: "https://heznpc.github.io/gallery",
    category: "app",
  },
  {
    id: "heznpc",
    name: "heznpc",
    description: "포트폴리오 / 프로필 허브",
    repo: "heznpc/heznpc",
    tag: "maintenance",
    stack: ["vanilla-js"],
    deployTarget: "github-pages",
    deployUrl: "https://heznpc.github.io",
    category: "app",
  },
  {
    id: "plantmonster",
    name: "PlantMonster",
    description: "AI 식물 식별 + 정령 수집 모바일 게임",
    tag: "prototype",
    stack: ["flutter"],
    deployTarget: "mobile",
    category: "app",
  },
  {
    id: "skillbridge",
    name: "SkillBridge",
    description: "Anthropic Academy 번역 브라우저 확장",
    repo: "heznpc/skillbridge",
    tag: "active",
    stack: ["chrome-extension"],
    deployTarget: "chrome-store",
    category: "app",
  },
  {
    id: "study",
    name: "Code Sense",
    description: "바이브코더를 위한 CS 기초 가이드",
    repo: "heznpc/code-sense",
    tag: "active",
    stack: ["node"],
    deployTarget: "none",
    category: "app",
  },
  {
    id: "tr-utils",
    name: "TR Archive",
    description: "테일즈러너 게임 데이터 유틸리티",
    repo: "Tales-Runner/TR-archive",
    tag: "active",
    stack: ["nextjs"],
    deployTarget: "vercel",
    deployUrl: "https://tr-archive.vercel.app",
    category: "app",
  },
  {
    id: "trashmonster",
    name: "TrashMonster",
    description: "폐기물 분류 모바일 게임 (캡스톤 연계)",
    tag: "prototype",
    stack: ["flutter"],
    deployTarget: "mobile",
    category: "app",
  },
  // ── Paper ──
  {
    id: "analogic",
    name: "Analogic Appropriation",
    description: "아동 종이 전투 놀이의 비교문화 연구",
    repo: "heznpc/analogic-appropriation",
    tag: "research",
    stack: ["latex"],
    deployTarget: "none",
    category: "paper",
  },
  {
    id: "eddy",
    name: "Eddy",
    description: "ADHD × AI 증강 멀티프로젝트 오케스트레이션 포지션 페이퍼",
    repo: "heznpc/eddy",
    tag: "research",
    stack: ["latex"],
    deployTarget: "zenodo",
    category: "paper",
  },
  {
    id: "ploidy",
    name: "PLOIDY",
    description: "컨텍스트 비대칭 구조화 토론을 통한 LLM 확증편향 감소",
    repo: "heznpc/PLOIDY",
    tag: "active",
    stack: ["python", "latex"],
    deployTarget: "zenodo",
    npmPackage: undefined,
    category: "paper",
  },
  {
    id: "villagent",
    name: "Villagent",
    description: "멀티에이전트 AI 협업 게임 디자인",
    repo: "heznpc/villagent",
    tag: "prototype",
    stack: ["nextjs", "typescript"],
    deployTarget: "none",
    category: "paper",
  },
  {
    id: "z-gap",
    name: "Z-Gap",
    description: "LLM 표현 공간 수렴 vs 자연어-코드 인터페이스 불일치",
    repo: "heznpc/z-gap",
    tag: "research",
    stack: ["latex", "python"],
    deployTarget: "none",
    category: "paper",
  },
  // ── MCP ──
  {
    id: "airmcp",
    name: "AirMCP",
    description: "Apple 생태계 MCP 서버 (262 tools)",
    repo: "heznpc/AirMCP",
    tag: "active",
    stack: ["typescript"],
    deployTarget: "npm",
    npmPackage: "airmcp",
    category: "mcp",
  },
];
