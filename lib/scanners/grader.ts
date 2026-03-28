import type { ProjectHealth, HealthGrade, Recommendation } from "../types";

export function gradeProject(health: Omit<ProjectHealth, "grade" | "recommendation" | "reasons">): {
  grade: HealthGrade;
  recommendation: Recommendation;
  reasons: string[];
} {
  const reasons: string[] = [];
  let score = 100;

  const { project, git, dependencies, stack, deploy } = health;

  // ── Tag-based baseline ──
  if (project.tag === "archived") {
    return { grade: "A", recommendation: "archive", reasons: ["아카이브 프로젝트 — 변경 불필요"] };
  }

  // ── Git health ──
  if (git) {
    if (git.uncommittedCount > 5) {
      score -= 10;
      reasons.push(`미커밋 파일 ${git.uncommittedCount}개`);
    }
    if (git.aheadBy > 0) {
      score -= 5;
      reasons.push(`리모트 대비 ${git.aheadBy}커밋 앞서 있음 (push 필요)`);
    }
    const daysSinceCommit = git.lastCommitDate
      ? Math.floor((Date.now() - new Date(git.lastCommitDate).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    if (daysSinceCommit !== null && project.tag === "active") {
      if (daysSinceCommit > 90) {
        score -= 15;
        reasons.push(`마지막 커밋이 ${daysSinceCommit}일 전 — active 프로젝트치고 오래됨`);
      } else if (daysSinceCommit > 30) {
        score -= 5;
        reasons.push(`마지막 커밋이 ${daysSinceCommit}일 전`);
      }
    }
  } else if (project.repo) {
    score -= 20;
    reasons.push("Git 정보를 가져올 수 없음");
  }

  // ── Dependencies ──
  if (dependencies) {
    if (dependencies.outdatedMajor > 0) {
      score -= dependencies.outdatedMajor * 15;
      reasons.push(`주요 의존성 ${dependencies.outdatedMajor}개가 메이저 버전 뒤처짐`);
    }
    if (dependencies.outdatedMinor > 2) {
      score -= 5;
      reasons.push(`${dependencies.outdatedMinor}개 마이너 업데이트 대기 중`);
    }
    if (dependencies.vulnerabilities > 0) {
      score -= dependencies.vulnerabilities * 20;
      reasons.push(`보안 취약점 ${dependencies.vulnerabilities}개 발견`);
    }
  }

  // ── Stack freshness ──
  for (const s of stack) {
    if (s.eol) {
      score -= 25;
      reasons.push(`${s.name} ${s.current} — EOL (지원 종료)`);
    } else if (s.releasesBehind >= 2) {
      score -= 15;
      reasons.push(`${s.name} ${s.current} → ${s.latest} (${s.releasesBehind} 메이저 뒤처짐)`);
    } else if (s.releasesBehind === 1) {
      score -= 5;
      reasons.push(`${s.name} ${s.current} → ${s.latest} (1 메이저 뒤처짐)`);
    }
  }

  // ── Deploy ──
  if (deploy.status === "down") {
    score -= 30;
    reasons.push("배포된 서비스가 다운 상태");
  }

  if (project.category === "paper" && health.research) {
    const research = health.research;
    if (research.fieldActivity === "hot") {
      score -= 10;
      reasons.push("분야 활동 활발 — 최신 관련 연구 확인 필요");
    } else if (research.fieldActivity === "active") {
      score -= 5;
      reasons.push("분야에 새 논문 꾸준히 게재 중 — 리뷰 권장");
    }
  }

  // ── Doc freshness ──
  if (health.docFreshness) {
    const df = health.docFreshness;
    if (!df.readmeVersionMatch) {
      const mismatchCount = df.mismatches.filter((m) => m.file === "README.md").length;
      score -= mismatchCount * 5;
      reasons.push(`README에 outdated 버전 언급 ${mismatchCount}건`);
    }
    if (!df.changelogUpToDate) {
      score -= 10;
      reasons.push("CHANGELOG에 최신 릴리스 버전 누락");
    }
    if (df.todoStaleness >= 10) {
      score -= 5;
      reasons.push(`TODO에 미완료 항목 ${df.todoStaleness}개 — 정리 필요`);
    }
    if (!df.agentsMdExists && project.tag === "active") {
      score -= 3;
      reasons.push("AGENTS.md 없음 — AI 코딩 컨텍스트 부재");
    }
  }

  // ── Maintenance mode leniency ──
  if (project.tag === "maintenance") {
    score = Math.min(100, score + 20); // More lenient
    if (reasons.length === 0) {
      reasons.push("유지보수 모드 — 현 상태 유지 OK");
    }
  }

  if (project.tag === "prototype") {
    score = Math.min(100, score + 10);
  }

  // ── Clamp & grade ──
  score = Math.max(0, Math.min(100, score));

  const grade: HealthGrade =
    score >= 90 ? "A" :
    score >= 75 ? "B" :
    score >= 60 ? "C" :
    score >= 40 ? "D" : "F";

  const recommendation: Recommendation =
    score >= 85 ? "keep" :
    score >= 65 ? "update" :
    score >= 40 ? "upgrade" : "rewrite";

  if (reasons.length === 0) {
    reasons.push("양호 — 특별한 조치 불필요");
  }

  return { grade, recommendation, reasons };
}
