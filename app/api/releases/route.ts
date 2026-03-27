import { fetchReleaseNotes, resolveGitHubRepo } from "@/lib/scanners/releases";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const packageName = searchParams.get("package");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const repo = searchParams.get("repo");

  if (!packageName || !from || !to) {
    return Response.json(
      { error: "package, from, to 파라미터 필요" },
      { status: 400 },
    );
  }

  // 입력 검증: 패키지명은 npm 스코프 + 패키지명 형식, 버전은 semver-like
  const validPkg = /^(@[a-z0-9_-]+\/)?[a-z0-9_.-]+$/i;
  const validVersion = /^[0-9][0-9a-z._-]*$/i;
  const validRepo = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

  if (!validPkg.test(packageName) || !validVersion.test(from) || !validVersion.test(to)) {
    return Response.json({ error: "잘못된 파라미터 형식" }, { status: 400 });
  }
  if (repo && !validRepo.test(repo)) {
    return Response.json({ error: "잘못된 repo 형식 (owner/repo)" }, { status: 400 });
  }

  const githubRepo = repo ?? (await resolveGitHubRepo(packageName));

  if (!githubRepo) {
    return Response.json(
      { error: "GitHub 저장소를 찾을 수 없습니다", packageName },
      { status: 404 }
    );
  }

  const notes = await fetchReleaseNotes(githubRepo, from, to, packageName);
  return Response.json(notes);
}
