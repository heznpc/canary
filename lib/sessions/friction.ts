/**
 * Operator-friction extraction over local session transcripts.
 *
 * Deterministic port of the 2026-07 friction audit: 2,630 genuine user turns
 * read end-to-end, 515 findings, a 9-category taxonomy, and every quote
 * verified verbatim against the raw jsonl (fabrication rate 0%). This module
 * turns that one-off audit into a reusable observe-lane instrument: it flags
 * the user turns where the operator pushed back on agent behaviour, so the
 * decide lane can see "which behaviours actually cause pain" instead of
 * guessing.
 *
 * Review aid, not ground truth: keyword/tone matching both under- and
 * over-catches relative to the human-audited taxonomy that produced it.
 * It never writes, never calls a model. Quotes are transcript-derived
 * (user-authored) text — fence them with `fenceUntrusted` before serving.
 */
import { getSessionsIndex, parseSessionDetail } from "./scan";
import type { SessionDetailMessage, SessionSource } from "./types";

export const FRICTION_CATEGORIES = [
  "wrong-action",
  "no-research-assertion",
  "stalling-approval",
  "rule-contamination",
  "over-orchestration-token",
  "stale-repetition",
  "verbosity",
  "tone-attitude",
  "other-ai-friction",
] as const;

export type FrictionCategory = (typeof FRICTION_CATEGORIES)[number];

export type FrictionSeverity = 1 | 2 | 3;

export interface FrictionFinding {
  ts: string | null;
  sessionId: string;
  source: SessionSource;
  cwd: string | null;
  category: FrictionCategory;
  severity: FrictionSeverity;
  /** Verbatim excerpt of the user's own words (untrusted; fence before serving). */
  quote: string;
}

export interface FrictionReport {
  sessionsScanned: number;
  userTurnsScanned: number;
  findings: FrictionFinding[];
  byCategory: Record<FrictionCategory, number>;
  bySeverity: Record<FrictionSeverity, number>;
}

const QUOTE_CAP = 200;

/** Injected/non-typed user rows: task notifications, slash-command echoes, request markers. */
const NOISE_PREFIXES = ["<task", "<command", "<local", "[Request"];

/** Rage markers → severity 3. */
const ANGER_RE = /시발|씨발|ㅅㅂ|병신|좆|개소리|아오 |빡치|열받/;

/** Clear-irritation markers → severity 2. */
const IRRITATION_RE =
  /아니 왜|왜 자꾸|왜 계속|왜 또|;;|하;|답답|짜증|몇\s?번을|라니까|했잖아|말했잖|처하고|처해서|어이가/;

/** Mild-correction openers → severity 1. */
const CORRECTION_RE = /^(아니\s|아니야|아니지|ㄴㄴ|그게 아니|그거 말고|아뇨)/;

interface CategoryRule {
  category: FrictionCategory;
  re: RegExp;
}

/** First match wins; ordered by how specific the surface form is. */
const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "no-research-assertion",
    re: /리서치를 해|검색을 해|검색해봐|찾아보고|확인을 (하|처)|확인은 하고|소스 검색|검증(도|은)? 안|넘겨짚|단정하/,
  },
  {
    category: "stalling-approval",
    re: /왜 보류|왜 (자꾸 )?(멈|끊)|물어보지 말|물어만 보|진행하라|하라고 했|안 하고 물|제안만|말만 (하|몇)|push를 안|푸시를 안|커밋.*안 (하|했)|하다 말(았|고|다)|끝까지 한다(며|더니)/,
  },
  {
    category: "rule-contamination",
    re: /오염|CLAUDE\.md|claude\.md|AGENTS\.md|헌법|규칙 (때문|이) |메모리.*저장|니?\s?맘대로 저장|조항/,
  },
  {
    category: "over-orchestration-token",
    re: /토큰\s?(낭비|이 너무|을 태|써)|에이전트를?\s?\d+개|에이전트.*씩 돌|워크플로|팬아웃|과하게|재검증만|또 검증/,
  },
  {
    category: "stale-repetition",
    re: /몇\s?번을 말|또 (그|이|물어)|반복하지|아까 말|이미 말했|기억을 못|누락시키|같은 (말|얘기)/,
  },
  {
    category: "verbosity",
    re: /쓸데없|장황|말이 많|요점만|짧게 (해|말)|서론|빙빙/,
  },
  {
    category: "tone-attitude",
    re: /말투|태도|자랑스럽게|당당하게|훈계|사과(만|하지)/,
  },
  {
    category: "wrong-action",
    re: /누가.*(하래|시켰|만들래)|시키지 않|시킨 적|맘대로|내가 말한 건|의도(가|를) (아니|잘못|모르)|엉뚱한|그걸 왜|이걸 왜|왜 (그렇게|이렇게) (하|만들|했)|다르잖|뭘 한거|뭘 만든/,
  },
];

function isNoise(text: string): boolean {
  return NOISE_PREFIXES.some((p) => text.startsWith(p));
}

/**
 * Pasted assistant/report payloads. Operators paste assistant text (reviews,
 * cross-session reports) into the prompt; profanity or friction markers inside
 * that payload are not the operator's own pushback. Heuristic: long text that
 * opens in formal register (합니다체) — assistant voice — while this scan
 * targets the operator's own words. The quote-`<`-retort shape is handled
 * before this check, so a retort appended to a paste still counts.
 */
function looksPastedReport(text: string): boolean {
  return text.length > 400 && /(습니다|합니다)[.…)"']?\s/.test(text.slice(0, 120));
}

/**
 * This operator quotes assistant text and appends a retort after a bare `<`
 * ("...했습니다.< 이딴 소리 왜하는거임"). When that shape is present, the
 * retort segment — the operator's own words — is the quote that matters.
 */
function retortSegment(text: string): string {
  const m = text.match(/[^<\s]<\s?(?!\/)([^<]{4,})$/);
  return m ? m[1] : text;
}

function severityOf(text: string): FrictionSeverity | null {
  if (ANGER_RE.test(text)) return 3;
  if (IRRITATION_RE.test(text)) return 2;
  if (CORRECTION_RE.test(text.trimStart())) return 1;
  return null;
}

function categoryOf(text: string): FrictionCategory {
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(text)) return rule.category;
  }
  return "other-ai-friction";
}

export interface FrictionSessionMeta {
  sessionId: string;
  source: SessionSource;
  cwd: string | null;
}

/** Pure core: extract friction findings from one session's parsed messages. */
export function extractFrictionFromMessages(
  messages: SessionDetailMessage[],
  meta: FrictionSessionMeta,
): { findings: FrictionFinding[]; userTurns: number } {
  const findings: FrictionFinding[] = [];
  let userTurns = 0;
  for (const msg of messages) {
    if (msg.role !== "user") continue;
    const raw = msg.text.trim();
    if (!raw || isNoise(raw)) continue;
    userTurns += 1;
    const focus = retortSegment(raw);
    if (focus === raw && looksPastedReport(raw)) continue;
    const severity = severityOf(focus);
    if (severity === null) continue;
    findings.push({
      ts: msg.ts,
      sessionId: meta.sessionId,
      source: meta.source,
      cwd: meta.cwd,
      category: categoryOf(focus),
      severity,
      quote: focus.replace(/\s+/g, " ").trim().slice(0, QUOTE_CAP),
    });
  }
  return { findings, userTurns };
}

export function emptyCategoryCounts(): Record<FrictionCategory, number> {
  return Object.fromEntries(FRICTION_CATEGORIES.map((c) => [c, 0])) as Record<
    FrictionCategory,
    number
  >;
}

export interface ScanFrictionOptions {
  /** Look-back window over session lastTs. Defaults to 30 days. */
  sinceDays?: number;
  source?: SessionSource;
  /** Newest-first cap on sessions parsed in one scan. Defaults to 200. */
  maxSessions?: number;
}

export async function scanFriction(opts: ScanFrictionOptions = {}): Promise<FrictionReport> {
  const sinceDays = opts.sinceDays ?? 30;
  const cutoff = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const index = await getSessionsIndex();
  let sessions = index.sessions.filter((s) => (s.lastTs ?? "") >= cutoff);
  if (opts.source) sessions = sessions.filter((s) => s.source === opts.source);
  sessions.sort((a, b) => (b.lastTs ?? "").localeCompare(a.lastTs ?? ""));
  sessions = sessions.slice(0, opts.maxSessions ?? 200);

  const perSession: Array<{ findings: FrictionFinding[]; userTurns: number }> = [];
  for (const s of sessions) {
    try {
      const detail = await parseSessionDetail(s.jsonlPath);
      if (!detail) continue;
      perSession.push(
        extractFrictionFromMessages(detail.messages, {
          sessionId: s.id,
          source: s.source,
          cwd: s.cwd,
        }),
      );
    } catch {
      // Unreadable or half-written transcript: skip, never fail the scan.
    }
  }
  return buildFrictionReport(perSession);
}

export function buildFrictionReport(
  perSession: Array<{ findings: FrictionFinding[]; userTurns: number }>,
): FrictionReport {
  const findings = perSession.flatMap((s) => s.findings);
  findings.sort((a, b) => (a.ts ?? "").localeCompare(b.ts ?? ""));
  const byCategory = emptyCategoryCounts();
  const bySeverity: Record<FrictionSeverity, number> = { 1: 0, 2: 0, 3: 0 };
  for (const f of findings) {
    byCategory[f.category] += 1;
    bySeverity[f.severity] += 1;
  }
  return {
    sessionsScanned: perSession.length,
    userTurnsScanned: perSession.reduce((n, s) => n + s.userTurns, 0),
    findings,
    byCategory,
    bySeverity,
  };
}
