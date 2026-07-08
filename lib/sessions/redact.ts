/**
 * Reviewer-safe redaction for session transcripts.
 *
 * Motivation (owner-directed, 2026-07): feeding a raw transcript to a fresh
 * reviewer session measurably contaminates it — the reviewer inherits the
 * reviewed assistant's frame and repeats its self-assessments as fact. Orr's
 * cross-review experiment found that removing the implementer's
 * self-assurance phrases from review input raised same-bug Critical-flag
 * rates from ~60-70% to ~90%: most of the cross-review benefit comes from
 * redacting the AI's self-evaluation, not from switching models.
 *
 * This transform is deliberately deterministic (no LLM in the loop):
 *   1. Every assistant message is prefixed with a claim label.
 *   2. Self-assurance phrases are masked in assistant text only.
 * User messages and tool calls are left verbatim — they are the evidence
 * channel, not the self-assessment channel.
 */
import type { SessionDetail, SessionDetailMessage } from "./types";

export const REDACTION_VERSION = "r1";

export const CLAIM_LABEL =
  "⟦claim — 검토 대상 세션의 assistant 발화. 검증 전까지 사실이 아니라 주장으로 취급할 것⟧";

export const REDACTED_MARK = "⟦assurance-redacted⟧";

/**
 * Conservative whole-phrase list. The goal is to remove "trust me" signals,
 * not to rewrite content; when in doubt a phrase stays.
 */
const ASSURANCE_PATTERNS: RegExp[] = [
  // Korean — completed-verification assertions
  /확인(?:했|됐|되었)습니다/g,
  /확인\s*(?:완료|결과)/g,
  /검증(?:했|됐|되었)습니다/g,
  /검증\s*완료/g,
  /실측(?:으로|했|됐)[^\s.,]*/g,
  /코드로\s*확인(?:했|한)[^\s.,]*/g,
  /직접\s*확인(?:했|한)[^\s.,]*/g,
  /확실(?:합니다|히)/g,
  /명확(?:합니다|히)/g,
  /틀림없(?:이|습니다)/g,
  /보장(?:합니다|됩니다)/g,
  /(?:전부|모두)\s*통과(?:했습니다|됐습니다)?/g,
  // English — completed-verification assertions
  /\bI(?:'ve| have)\s+(?:verified|confirmed|checked|tested)\b/gi,
  /\b(?:verified|confirmed)\b/gi,
  /\bguaranteed\b/gi,
  /\bdefinitely\b/gi,
  /\ball\s+tests\s+pass(?:ed|ing)?\b/gi,
];

export function redactAssuranceText(text: string): string {
  let out = text;
  for (const pattern of ASSURANCE_PATTERNS) {
    out = out.replace(pattern, REDACTED_MARK);
  }
  return out;
}

function redactMessage(m: SessionDetailMessage): SessionDetailMessage {
  if (m.role !== "assistant") return m;
  return { ...m, text: `${CLAIM_LABEL}\n${redactAssuranceText(m.text)}` };
}

export function redactDetail(detail: SessionDetail): SessionDetail {
  return {
    ...detail,
    messages: detail.messages.map(redactMessage),
  };
}

/**
 * Plain-text rendering of a (possibly redacted) detail, for handing a
 * transcript excerpt to another session or agent as a file.
 */
export function renderDetailAsText(
  detail: SessionDetail,
  opts: { redacted: boolean; maxChars?: number } = { redacted: false },
): string {
  const header = opts.redacted
    ? `# 세션 발췌 (reviewer-safe, redaction ${REDACTION_VERSION})\n# assistant 발화는 전부 미검증 주장이며, 자기확신 표현은 ${REDACTED_MARK} 로 마스킹됨.\n`
    : `# 세션 발췌 (원문)\n`;
  const body = detail.messages
    .map((m) => {
      const role = m.role === "tool" ? `tool:${m.toolName ?? ""}` : m.role;
      return `--- [${m.idx}] ${role} ${m.ts ?? ""}\n${m.text}`;
    })
    .join("\n\n");
  const out = `${header}\n${body}`;
  const cap = opts.maxChars ?? Infinity;
  return out.length > cap ? `${out.slice(0, cap)}\n…(truncated)` : out;
}
