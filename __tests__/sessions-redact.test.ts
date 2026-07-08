import { describe, expect, it } from "vitest";

import {
  CLAIM_LABEL,
  REDACTED_MARK,
  redactAssuranceText,
  redactDetail,
  renderDetailAsText,
} from "../lib/sessions/redact";
import type { SessionDetail } from "../lib/sessions/types";

const detail: SessionDetail = {
  summary: {
    id: "claude:test",
    source: "claude",
    jsonlPath: "/tmp/test.jsonl",
    cwd: "/tmp",
    title: "t",
    firstTs: null,
    lastTs: null,
    userCount: 1,
    assistantCount: 1,
    toolCount: 1,
    flaggedCount: 0,
    fileSizeBytes: 0,
  },
  messages: [
    { idx: 0, ts: null, role: "user", text: "코드 확인했어?" },
    {
      idx: 1,
      ts: null,
      role: "assistant",
      text: "네, 코드로 확인했습니다. 중복이 확실합니다. All tests passed.",
    },
    { idx: 2, ts: null, role: "tool", text: "git diff", toolName: "Bash", paths: [] },
  ],
  fileAccess: [],
  parseErrors: 0,
};

describe("redactAssuranceText", () => {
  it("masks Korean and English assurance phrases", () => {
    const out = redactAssuranceText("검증했습니다. I have verified it. definitely fine.");
    expect(out).not.toMatch(/검증했습니다/);
    expect(out).not.toMatch(/verified/i);
    expect(out).not.toMatch(/definitely/i);
    expect(out.split(REDACTED_MARK).length).toBeGreaterThan(2);
  });

  it("leaves plain statements alone", () => {
    const s = "이 함수는 mtime 캐시를 사용한다.";
    expect(redactAssuranceText(s)).toBe(s);
  });
});

describe("redactDetail", () => {
  it("labels assistant messages and masks assurance, leaving user/tool verbatim", () => {
    const r = redactDetail(detail);
    expect(r.messages[0].text).toBe("코드 확인했어?"); // user untouched
    expect(r.messages[1].text.startsWith(CLAIM_LABEL)).toBe(true);
    expect(r.messages[1].text).toContain(REDACTED_MARK);
    expect(r.messages[1].text).not.toMatch(/확실합니다/);
    expect(r.messages[2].text).toBe("git diff"); // tool untouched
    // original object untouched
    expect(detail.messages[1].text).toMatch(/확실합니다/);
  });
});

describe("renderDetailAsText", () => {
  it("renders redacted header and caps length", () => {
    const text = renderDetailAsText(redactDetail(detail), { redacted: true, maxChars: 300 });
    expect(text).toContain("reviewer-safe");
    expect(text.length).toBeLessThanOrEqual(320);
  });
});
