# canary — Review (2026-04-11)

## 1. 커밋 톤이 주장을 일관되게 지지하는가?

**판정: 매우 일관됨, 본 survey 21개 paper 중 commit discipline TOP — 26 commits.**

```
8e412be refactor: replace stub scanners with real checks (#1)              (2026-04-11)
0217de5 feat(scanners): integrate CAM, ACR, metadatafication phase classifier (2026-04-11)
0d3d9dc docs(paper): sync manuscript.md with main.tex                       (2026-04-11)
527753c gitignore: exclude CLAUDE.md and .claude/                           (2026-04-08)
445501b fix: use tsx instead of node for TypeScript module loading
dc5e3b7 fix: correct governance classification and update statistical results
06375a0 feat: add 5 experiments, statistical tests, threats to validity   (2026-04-05)
43ea02e refactor: reposition paper as Design Science Research
fa8363c fix: correct bib author umlauts and cite key for Galster et al.
fc361f6 feat: add 4 missing citations, expand CAM to 7 ecosystems
61fca02 fix: harden CAM experiment design and re-run with improved methodology
262ec4e feat: run CAM experiment and integrate preliminary findings
69f1ede feat: enhance paper with Z-Gap cross-references, CAM experiment design
83dfffb feat: add metadatafication research paper as monorepo
4234469 refactor: OSS readiness — externalize config, add LICENSE, code cleanup
f29af29 chore: remove TODO.md and add to .gitignore
a565a9b feat: add OpenSSF Scorecard integration and Dependabot/Renovate detection
241e5bf feat: add English README, multilingual landing page, GitHub Pages deployment
578784c feat: add code quality, activity, and data freshness scanners
629ebff feat: add health check, structured logging, circuit breaker, request tracing
73acb7b feat: add doc freshness scanner and heznpc sync system
c1c043c test: add CI workflow and expand tests to 63
ea6bbe5 feat: add security hardening, API caching, test infrastructure
0107435 feat: Canary — 프로젝트 건강 대시보드 MVP                          (~2026-03-29)
942ba05 feat: initial commit
259d762 Initial commit from Create Next App                                 (2026-03-28)
```

진화 패턴은 *교과서적 software engineering*:
- **Phase 1 (3/28 ~ 3/30)**: Next.js scaffold → 5개 scanner MVP. 본업으로서의 *서비스* 먼저 구축.
- **Phase 2 (3/30 ~ 4/3)**: 보안/캐시/circuit breaker/structured logging/CI → 63 tests → multilingual landing page → GitHub Pages 배포 → OpenSSF Scorecard 통합. **production-grade hardening**이 paper와 *완전히 분리*되어 진행됨.
- **Phase 3 (4/3 ~ 4/5)**: 4월 3일에 *처음으로 paper 추가* — `83dfffb feat: add metadatafication research paper as monorepo`. 즉 *서비스가 먼저 5일간 만들어진 후 paper가 monorepo로 들어옴*. 이건 unique. 다른 모든 paper 레포는 paper 우선이지만 canary는 *서비스 우선, paper 후합류*.
- **Phase 4 (4/5)**: 동일한 날 5개 commit으로 paper 강화 — CAM experiment 재실행, 4개 누락 인용 추가, falsifiability 추가, *Design Science Research로 paper 재포지셔닝*, 7개 ecosystem으로 CAM 확장, 5개 experiment + statistical tests + threats to validity + infrastructure theory.
- **Phase 5 (4/8 ~ 4/11)**: paper와 service 동기화. Critical fix가 4/11에 들어옴 — 한 commit에 *43개 파일, +1,367/-432 lines*. **stub scanner를 real check로 교체** + lint 빨강 fix(4월 5일부터 CI red) + data externalization + 50개 test 추가(168 total green). *self-review에서 발견된 정직한 cluster fix*.
- 추가 4/11 commit: CAM, ACR, metadatafication phase classifier를 *runtime scanner로* 통합. 즉 paper §5.4의 metric을 dashboard에서 *모든 프로젝트마다 자동 계산*.

톤 일관성:
- 핵심 주장(metadatafication = direct tool → infrastructure metadata 3-phase 전이, CAM = Context Attention Metric, ACR = Agent-Authored Commit Ratio, agent-readability optimization)이 모든 단계에서 동일.
- **paper ↔ service 일대일 매핑이 progressively tightening**: paper가 처음에 들어왔을 때는 분리돼 있었지만, 4/11 commit에서 §3.1 phase 분류를 *runtime scanner로 구현*. **theory와 implementation이 한 monorepo에서 co-evolve**. 본 survey 21개 중 paper-service coupling 가장 강함.
- **자기 비판이 commit message에 명시**: "stub scanner가 real check 흉내냈다", "circuit breaker가 실제로 trip하지 않았다", "CI red on main since 4/5"... reviewer가 *자기 작품을 의심하는 commit*은 매우 드물고 강력한 신뢰 신호.
- `EXPERIMENT-AUDIT.md`에 "E3 measures the wrong thing", "E6 tests the wrong theory", "Both should not be implemented in current form"이라는 *자기 비판 audit 보고서*가 정식 문서로 존재. 4월 4일자.
- 단점: paper §3.1의 phase classifier가 4/11 commit에서 처음 코드로 들어왔는데, *논문에서 인용한 통계*(Mann-Whitney p=0.017, U=21.0, r=0.62)가 *그 이전 데이터로* 산출됨. 즉 paper의 stat은 4/3-4/5 시점 데이터인데 service는 4/11에 동일 metric을 *runtime*에 통합. 시점이 어긋남.

## 2. 부가 서비스 품질

**판정: 부가 서비스 = paper의 핵심. 본 survey 21개 paper 중 압도적 1위 (production-grade Next.js 16 application).**

서비스 구성:
- **Next.js 16 App Router + React 19 + TypeScript + Tailwind 4 + shadcn/ui**: 2026 1분기 최신 stack. JetBrains 2026 survey 73% 사용 stack과 일치.
- **22개 scanner** (`lib/scanners/`): github, code-quality, activity, deploy, stack, grader, docs, data-freshness, vibecoding, research, releases, vulnerabilities, scorecard, deps-flutter, deps-jvm, deps-python, version-utils, shared-breaker, **cam, acr, metadatafication** (4/11 추가), index.
- **16개 test 파일** (`__tests__/`): vitest, 168 tests green (4/11 기준). cache, rate-limit, projects, utils, stack, releases, deploy, logger, circuit-breaker, vulnerabilities, grader, version-utils, docs, cam, acr, metadatafication.
- **인프라 요소**: in-memory TTL cache, sliding-window rate limiter, circuit breaker(shared-breaker), structured JSON logger, health check endpoint, 8 API routes (`/api/scan`, `/api/projects/[id]`, `/api/health`, `/api/releases`, `/api/sync` 등).
- **외부 통합**: GitHub REST API (Octokit), Semantic Scholar, npm/PyPI/pub.dev/Maven Central, OSV.dev (vulnerability), endoflife.date (stack EOL), doi.org (Zenodo), Chrome Web Store.
- **Multilingual landing page** (`landing/`): vanilla JS, GitHub Pages 배포. data-i18n attributes로 다국어. Hero/Features/How/Grading/GitHub.
- **OSS readiness**: LICENSE (MIT), CONTRIBUTING.md, SECURITY.md, CHANGELOG.md, .github/dependabot.yml — 4/11 commit에서 *Canary 자체의 code-quality.ts scanner가 요구하는 파일*을 본인 repo에 추가. *eat your own dogfood*.

품질 평가:
- **Production-grade**: 4/11 critical fix commit이 보여주듯 stub→real, dead code 제거, circuit breaker actually trip, vulnerability scanning real (OSV.dev), deploy verification real (Zenodo doi.org / Chrome Web Store HEAD probe). 더 이상 demo 수준이 아님.
- **Data externalization 완료**: heznpc 개인 데이터(starters, flagship IDs, meta)를 라이브러리에서 분리, `canary.config.ts`로 옮김. 다른 사용자가 그대로 쓸 수 있는 *generalized OSS product*.
- **Self-scan 기본 제공**: `canary.config.ts`가 default로 self-scan 항목 포함. dashboard가 *out of the box로* 동작.
- **CAM/ACR/Metadatafication을 runtime scanner로 통합**: paper §5.4의 evaluation metric이 *모든 사용자의 모든 프로젝트마다 자동으로 측정*된다. **paper가 서비스 사용자에게 즉시 가치 제공**.
- 한계: 4/11 critical fix가 워낙 큰 cluster라(43 files, +1367/-432) 다른 사용자가 *production*으로 쓰기 전 1주 정도 안정화 필요. CHANGELOG의 [Unreleased] 항목들이 아직 release 안 됨.

## 3. 고도화 가능 파트

높은 우선순위:
1. **v0.1.0 release** — CHANGELOG의 [Unreleased] 항목을 그대로 cut. SemVer 시작. Zenodo DOI 발행으로 *연구 산출물*로서의 citation handle 확보.
2. **paper §5.4의 통계 재실행** — Phase classifier가 runtime scanner가 됐으니 *paper에 인용된 stat*(Mann-Whitney p=0.017, U=21.0, r=0.62)를 4/11 시점 데이터로 다시 산출. paper의 reproducibility 강화.
3. **N=1 developer 한계 해결** — 현재 CAM 데이터는 heznpc 본인 8개 프로젝트(user portfolio) + 21개 traditional + AI-adjacent 3개. EXPERIMENT-AUDIT.md가 명시한 핵심 약점("circular reasoning"). 다른 5명 developer에게 canary를 돌려 30+개 외부 portfolio를 추가하면 *external validity* 확보.
4. **DSR(Design Science Research) framing 강화** — 4/3 commit에서 paper를 DSR로 reposition. DSR 5단계(awareness/suggestion/development/evaluation/conclusion)에 맞춰 §1-7 정렬되어 있는지 확인. *Hevner et al. 2004*의 7 guidelines 명시적 매핑이 좋은 reviewer 사인.
5. **CAM-LOC + ACR + temporal trajectory + 5 experiments cross-validation**: 5개 experiment 결과가 *서로 일관*한지 cross-check. 만약 한 experiment의 결과가 다른 것과 모순되면 reviewer가 즉시 짚는다.

중간 우선순위:
6. **Phase 1/2/3 transition을 *시계열적으로* 추적** — 현재는 snapshot. 매주 자동 scan → CAM/ACR 값을 시계열 DB(SQLite or Postgres)에 저장 → "metadatafication progress over time" 그래프 paper §5.4.1 강화.
7. **AGENTS.md vs CLAUDE.md vs .cursorrules vs .copilot 통계** — Chatlatanagulchai et al. 2025가 인용한 2,303 context files dataset에 canary를 적용. 외부 데이터셋 cross-check.
8. **MCP servers ecosystem 통합** — paper §6 capability marketplaces가 핵심 contribution. MCP server 카탈로그를 dashboard에 통합하면 paper의 thesis가 product에 직접 반영됨.
9. **Plain English `Why this grade?` UX** — A-F grade가 매겨질 때 LLM-generated explanation. 사용자 채택률 증가.

낮은 우선순위:
10. mobile-responsive design 검증.
11. README 영문 1순위로 reorder (현재는 한글이 prominent).
12. CHANGELOG에 0.1.0 → 0.2.0 → ... 형식의 release tag 시작.

## 4. 학술적 / 시장 가치 (글로벌, 2026-04-11 기준)

### 학술적 가치: **상위권 (working paper 기준 상위 ~5%, DSR 트랙 한정 시 top 5%)**

차별점:
- **Theory + Implementation 일치도가 본 survey 21개 중 압도적 1위**. paper §5.4의 metric이 production-grade scanner로 *동작*. reviewer가 즉시 검증 가능 — repo clone → npm install → npm run dev → API call → 동일 결과.
- **Metadatafication 개념의 명료함**: 3-phase 전이 모델(active tool → assisted tool → infrastructure metadata) + boundary conditions 2개 + governance moderator 1개. 인용 가능한 *vocabulary anchor*. EXIF/DNS/TCP/IP 비유가 직관적.
- **Design Science Research 트랙의 이상적 형태**: artifact (Canary) + theory (metadatafication) + evaluation (CAM/ACR/temporal) + reflective audit (EXPERIMENT-AUDIT.md). DSR의 모든 요소가 갖춰짐.
- **자기 비판 audit (EXPERIMENT-AUDIT.md)이 reviewer 신뢰도 +2 단계 끌어올림**: "E3 measures the wrong thing... no adversarial step in pipeline... root cause analysis"... 본인 작품을 *공식 문서로 비판*하고 *redesign required*로 표시. 매우 드물고 강력.
- **AI agent 전용 dataset과의 cross-citation**: Li et al. 2025 (456K PRs from Codex/Devin/Copilot/Cursor/Claude Code), AGENTS.md research(Chatlatanagulchai et al.), Galster et al. 2026, Pinera 2026 (rethinking VCS), Cohen 2026 (Manyana CRDT VCS), Hassan 2025 (SE 3.0). **2025-2026의 핫 페이퍼 망라**.

위험:
- **N=1 developer circularity** — EXPERIMENT-AUDIT.md가 본인이 인정한 핵심 약점. CAM 데이터의 표본이 본인 portfolio 위주. external validity 확보 없이는 reviewer가 첫 round에서 reject 가능.
- **CAM/ACR metric의 정의 안정성**: 4/11 commit에서 처음 *runtime scanner로* 정착. 즉 paper에 인용된 stat은 *4/3-4/5 시점*의 다른 구현체로 산출. *재현성 risk*. 4/11 정의로 다시 산출해야 동일 결과 나옴을 보장.
- **Anonymous 저자**: main.tex line 24가 "Anonymous". double-blind 가정인데 GitHub username heznpc + 한글 commit message가 anonymization을 깨뜨림.
- **DSR repositioning 늦음**: 4/3 commit에서 reposition. paper 구조 자체가 DSR 5단계에 *명시적으로 정렬*돼 있는지 확인 필요.
- "metadatafication"이 기존 *infrastructure studies*(Star & Ruhleder, Bowker, Edwards) 전통과 *얼마나 새로운가*가 reviewer 핵심 질문. paper §3.1에서 narrowing claim을 했지만 더 강하게 형식화 필요.

게재 전망:
- *ACM Transactions on Software Engineering and Methodology (TOSEM)* DSR 트랙: **realistic, 50-60%**. DSR이 잘 받아들여짐. paper + artifact 둘 다 평가.
- *IEEE Software* (perspective 트랙): **60-70%**. 시의성 + practitioner 친화도. canary가 immediately useful.
- *ICSE 2027* (Software Engineering in Society 트랙): **40-50%**. metadatafication + AGENTS.md cluster.
- *MSR 2027* (Mining Software Repositories): **50-60%**. CAM/ACR mining methodology가 핵심 contribution.
- *FSE 2027*: 40-50%.
- *Communications of the ACM* practice 트랙: 30-40%.

### 시장 가치: **압도적 상위 (실제 사용 가능한 product, 본 survey 21개 중 1위)**

- **Open-source dev tool 시장**: GitHub Marketplace, Vercel Marketplace에 즉시 listed 가능. SaaS landscape 모니터링 분야에 직접 진입. Productiv/Zylo/Torii의 *lightweight competitor*.
- **AI coding tool 회사**: Anthropic, OpenAI, GitHub, Cursor, Windsurf, Lovable이 *AGENTS.md / CLAUDE.md adoption metric*을 추적하기 위해 직접 사용 가능. 마케팅 자료에 활용 가능 (e.g., "Claude Code adoption grew 47% Q1 2026 per Canary CAM").
- **Enterprise dev productivity**: SaaS 30개 toggling 1,200회 문제(Murty et al. 2022)와 직접 연결. CTO/CIO가 portfolio health check tool로 채택 가능.
- **Research instrument**: AGENTS.md / CLAUDE.md / .cursorrules adoption 연구에 *데이터 수집 도구*로 reuse 가능. 다른 academic 그룹의 second-hand citation 가능성 매우 높음.
- **OSS funding 가능성**: GitHub Sponsors, Open Collective. canary 자체가 OSS health 측정 도구라 OSS 운영자에게 강한 어필. Open Source Index, OSI, Linux Foundation이 자연 후원자.
- **paper와 service의 dual-asset**: paper는 학술적 정당화, service는 시장 가치. 두 자산이 서로 강화. **본 survey 21개 중 *유일하게* 둘 다 production 수준**.

### 종합 평점 (2026-04-11)

| 축 | 점수 | 코멘트 |
|---|---|---|
| Originality of construct | 9/10 | metadatafication + CAM + ACR + 3-phase model |
| Theoretical foundation | 8/10 | Star/Ruhleder/Bowker/Edwards 전통 위에 정착 |
| Empirical contribution | 8/10 | 5 experiments + bootstrap CI + Mann-Whitney + N=42 |
| Service quality | 10/10 | Production-grade Next.js 16, 168 tests, real APIs |
| Theory-implementation coupling | 10/10 | §5.4 metric이 runtime scanner로 동작 |
| Self-criticism | 10/10 | EXPERIMENT-AUDIT.md가 본인 작품을 거부 |
| Repo health | 10/10 | 26 commits, CHANGELOG, CONTRIBUTING, SECURITY, CI green |
| External validity | 4/10 | N=1 developer circularity 미해결 |
| Submission readiness | 8/10 | DSR repositioning 완료, statistics 재실행 필요 |
| Timing | 10/10 | AGENTS.md/CLAUDE.md 모멘텀 정점 |
| Practical applicability | 10/10 | 즉시 OSS dev tool로 사용 가능 |
| **Overall (DSR paper + product)** | **9.0/10** | **본 survey 21개 중 압도적 1위** |

핵심 격언: **"Theory + Service + 자기비판이 한 monorepo에 동시 존재하는 가장 성숙한 작품. N=1 한계만 5명 다른 developer 데이터로 메우면 9.5+로 점프."** ICSE/TOSEM/MSR 어디로 보내도 통할 가능성. 본 survey 21개 paper 중 *지금 당장 가장 publish-ready*한 케이스. canary는 paper인 동시에 product다.
