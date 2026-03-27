import type { ProjectConfig } from "../projects";
import type { RecentPaper, ResearchIntel } from "../types";
import { fetchWithTimeout } from "./version-utils";

const S2_API = "https://api.semanticscholar.org/graph/v1";
const S2_API_KEY = process.env.S2_API_KEY;
const FIELDS = "title,authors,year,venue,citationCount,url,tldr";

// rate limit: 429 응답 시 재시도 1회 (1초 대기)
async function s2Fetch(url: string): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (S2_API_KEY) headers["x-api-key"] = S2_API_KEY;

  const res = await fetchWithTimeout(url, { headers }, 8000);
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1000));
    return fetchWithTimeout(url, { headers }, 8000);
  }
  return res;
}

interface S2Paper {
  paperId: string;
  title: string;
  authors?: { name: string }[];
  year?: number;
  venue?: string;
  citationCount?: number;
  url?: string;
  tldr?: { text: string };
}

interface S2SearchResponse {
  total: number;
  data: S2Paper[];
}

async function searchPapers(
  query: string,
  yearFrom: number,
  limit = 10,
): Promise<{ total: number; papers: S2Paper[] }> {
  const params = new URLSearchParams({
    query,
    fields: FIELDS,
    limit: String(limit),
    year: `${yearFrom}-`,
  });

  const res = await s2Fetch(`${S2_API}/paper/search?${params}`);

  if (!res.ok) return { total: 0, papers: [] };

  const data: S2SearchResponse = await res.json();
  return { total: data.total ?? 0, papers: data.data ?? [] };
}

function toRecentPaper(p: S2Paper): RecentPaper {
  const authorNames = (p.authors ?? []).map((a) => a.name);
  const display =
    authorNames.length <= 2
      ? authorNames.join(", ")
      : `${authorNames[0]} 외 ${authorNames.length - 1}명`;

  return {
    title: p.title,
    authors: display,
    year: p.year ?? 0,
    venue: p.venue || undefined,
    citationCount: p.citationCount ?? 0,
    url: p.url ?? `https://www.semanticscholar.org/paper/${p.paperId}`,
    tldr: p.tldr?.text,
  };
}

function judgeActivity(
  totalRecent: number,
  avgCitations: number,
): ResearchIntel["fieldActivity"] {
  if (totalRecent > 200 && avgCitations > 10) return "hot";
  if (totalRecent > 50) return "active";
  if (totalRecent > 10) return "stable";
  return "quiet";
}

function buildSuggestion(
  activity: ResearchIntel["fieldActivity"],
  recentCount: number,
): string {
  if (activity === "hot") {
    return `분야가 활발함 — 최근 ${recentCount}편 이상 게재. 관련 연구 업데이트 검토 권장`;
  }
  if (activity === "active") {
    return `꾸준히 논문이 나오는 분야. 새로운 접근이나 비교 대상 확인 필요`;
  }
  if (activity === "stable") {
    return "분야 활동 안정적. 현재 포지셔닝 유효할 가능성 높음";
  }
  return "최근 논문이 적은 분야 — 니치 포지셔닝에 유리하거나, 관련 키워드 재검토 필요";
}

export async function analyzeResearch(
  project: ProjectConfig,
): Promise<ResearchIntel | null> {
  if (project.category !== "paper" || !project.keywords?.length) {
    return null;
  }

  const currentYear = new Date().getFullYear();
  const yearFrom = currentYear - 1; // 최근 1년

  // 키워드 조합으로 검색 (전체 + 개별 상위 키워드)
  const mainQuery = project.keywords.join(" ");
  const { total, papers } = await searchPapers(mainQuery, yearFrom, 10);

  const recentPapers = papers
    .map(toRecentPaper)
    .sort((a, b) => b.citationCount - a.citationCount)
    .slice(0, 5);

  const avgCitations =
    recentPapers.length > 0
      ? recentPapers.reduce((s, p) => s + p.citationCount, 0) /
        recentPapers.length
      : 0;

  const activity = judgeActivity(total, avgCitations);

  // 트렌딩 키워드 추출: 논문 제목에서 자주 나오는 단어
  const trendingKeywords = extractTrendingTerms(papers, project.keywords);

  const suggestion = buildSuggestion(activity, total);

  return {
    recentPapers,
    trendingKeywords,
    fieldActivity: activity,
    suggestion,
    lastChecked: new Date().toISOString(),
  };
}

function extractTrendingTerms(
  papers: S2Paper[],
  ownKeywords: string[],
): string[] {
  const stopWords = new Set([
    "a", "an", "the", "of", "in", "for", "and", "or", "to", "with",
    "on", "by", "is", "are", "from", "that", "this", "its", "as", "at",
    "we", "our", "using", "based", "via", "can", "be", "it", "do",
  ]);
  const ownSet = new Set(
    ownKeywords.flatMap((k) => k.toLowerCase().split(/\s+/)),
  );

  const freq = new Map<string, number>();
  for (const p of papers) {
    const words = p.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w) && !ownSet.has(w));

    for (const w of new Set(words)) {
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }

  return [...freq.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([word]) => word);
}
