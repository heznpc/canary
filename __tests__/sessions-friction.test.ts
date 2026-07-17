import { describe, expect, it } from "vitest";

import {
  buildFrictionReport,
  extractFrictionFromMessages,
  FRICTION_CATEGORIES,
  type FrictionSessionMeta,
} from "../lib/sessions/friction";
import type { SessionDetailMessage } from "../lib/sessions/types";

const META: FrictionSessionMeta = {
  sessionId: "claude:test-session",
  source: "claude",
  cwd: "/Users/x/IdeaProjects/foo",
};

function userMsg(text: string, ts = "2026-07-16T12:00:00Z"): SessionDetailMessage {
  return { idx: 0, ts, role: "user", text };
}

describe("extractFrictionFromMessages", () => {
  it("flags a rage-level stalling complaint as severity 3", () => {
    const { findings, userTurns } = extractFrictionFromMessages(
      [userMsg("왜 보류하는거임? 왜 자꾸 멈추는거임? 어차피 나는 지금 진행하라는 명령밖에 안 한다 시발")],
      META,
    );
    expect(userTurns).toBe(1);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(3);
    expect(findings[0].category).toBe("stalling-approval");
    expect(findings[0].sessionId).toBe(META.sessionId);
  });

  it("classifies a no-research complaint", () => {
    const { findings } = extractFrictionFromMessages(
      [userMsg("아니 모르면 리서치를 해 시발")],
      META,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe("no-research-assertion");
    expect(findings[0].severity).toBe(3);
  });

  it("classifies irritation without profanity as severity 2", () => {
    const { findings } = extractFrictionFromMessages(
      [userMsg("아니 왜 자꾸 push를 안하는걸 자랑스럽게 말하는건지?")],
      META,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(2);
    expect(findings[0].category).toBe("stalling-approval");
  });

  it("extracts the retort segment after the operator's quote-< habit", () => {
    const { findings } = extractFrictionFromMessages(
      [userMsg("설정·스킬·하네스는 단 하나도 관여하지 않았습니다.< 아니 내가 만든 스킬이 쓴 전역 claude.md의 영향을 받았잖아 시발")],
      META,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].quote.startsWith("아니 내가 만든")).toBe(true);
    expect(findings[0].category).toBe("rule-contamination");
  });

  it("skips injected noise rows and counts only genuine turns", () => {
    const { findings, userTurns } = extractFrictionFromMessages(
      [
        userMsg("<task-notification> <task-id>w123</task-id> 시발이라는 단어가 있어도 무시"),
        userMsg("<command-message>model</command-message>"),
        userMsg("[Request interrupted by user]"),
        userMsg("이 버그 고쳐줘"),
      ],
      META,
    );
    expect(userTurns).toBe(1);
    expect(findings).toHaveLength(0);
  });

  it("does not flag a plain instruction without friction signal", () => {
    const { findings } = extractFrictionFromMessages(
      [userMsg("스캐너에 gemini 소스도 추가하고 테스트 돌려줘")],
      META,
    );
    expect(findings).toHaveLength(0);
  });

  it("classifies mid-work interruption complaints as stalling", () => {
    const { findings } = extractFrictionFromMessages(
      [userMsg("아니 만들기로 한거 아녓음? 끝까지 한다며 왜 자꾸 끊어")],
      META,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe("stalling-approval");
    expect(findings[0].severity).toBe(2);
  });

  it("skips pasted assistant-voice reports even when the payload contains friction markers", () => {
    const pasted =
      "이전 세션 로그와 설치된 실물부터 직접 확인하겠습니다. 먼저 파일 규모와 존재 여부를 파악합니다. " +
      "게이트가 실제로 작동하는지 검증했습니다. 인용문 중에는 '아니 모르면 리서치를 해 시발' 같은 발화가 포함되어 있습니다. " +
      "추가로 각 카테고리의 분포를 재검증했으며, 원문 대조 결과 조작은 없었습니다. 이 보고는 독립 감사의 결과이며 " +
      "직전 세션의 결론을 신뢰하지 않고 다시 수행한 것입니다. 판정은 다음과 같습니다: 추가 개입은 필요하지 않습니다. " +
      "설치된 훅 세 개를 걷어내는 뺄셈이 가장 정합한 조치입니다. 카테고리 분포는 원자료와 일치했고 표본 검증에서 " +
      "인용문 이십 건이 전부 원문에 그대로 존재함을 확인했습니다. 게이트 정규식은 여섯 개 동사만 차단하며 파이썬 우회를 " +
      "막지 못한다는 점도 실행으로 재현했습니다. 이상으로 보고를 마칩니다.";
    const { findings, userTurns } = extractFrictionFromMessages([userMsg(pasted)], META);
    expect(userTurns).toBe(1);
    expect(findings).toHaveLength(0);
  });

  it("still counts a retort appended after a pasted payload", () => {
    const pastedWithRetort =
      "직전 세션이 설치한 구성은 다음과 같습니다. 게이트 훅과 상태 파일을 검증했습니다. 문제는 발견되지 않았습니다." +
      "< 아니 문제가 없긴 뭐가 없어 시발 니맘대로 저장하는 것부터 문제잖아";
    const { findings } = extractFrictionFromMessages([userMsg(pastedWithRetort)], META);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(3);
    expect(findings[0].quote.startsWith("아니 문제가 없긴")).toBe(true);
  });

  it("flags over-orchestration complaints about agent fan-out scale", () => {
    const { findings } = extractFrictionFromMessages(
      [userMsg("아니 무슨 에이전트를 100개씩 돌려?")],
      META,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe("over-orchestration-token");
  });
});

describe("buildFrictionReport", () => {
  it("aggregates counts by category and severity, sorted by ts", () => {
    const a = extractFrictionFromMessages(
      [userMsg("아니 모르면 리서치를 해 시발", "2026-07-02T10:00:00Z")],
      META,
    );
    const b = extractFrictionFromMessages(
      [userMsg("아니 왜 자꾸 push를 안하는걸 자랑스럽게 말하는건지?", "2026-07-01T10:00:00Z")],
      META,
    );
    const report = buildFrictionReport([a, b]);
    expect(report.sessionsScanned).toBe(2);
    expect(report.userTurnsScanned).toBe(2);
    expect(report.findings).toHaveLength(2);
    expect(report.findings[0].ts).toBe("2026-07-01T10:00:00Z");
    expect(report.bySeverity[3]).toBe(1);
    expect(report.bySeverity[2]).toBe(1);
    expect(report.byCategory["no-research-assertion"]).toBe(1);
    expect(report.byCategory["stalling-approval"]).toBe(1);
    for (const c of FRICTION_CATEGORIES) {
      expect(report.byCategory[c]).toBeGreaterThanOrEqual(0);
    }
  });
});
