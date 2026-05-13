# Anonymization — explicit no-op for Onward! Essays

## Onward! review model

Onward! Essays uses **single-blind** review:

> "Onward! essays are peer-reviewed in a single-blind manner."
> — <https://2026.splashcon.org/track/splash-2026-onward--essays>

Reviewers know the author identity; authors do not know reviewers.
Therefore **no anonymization is required for this submission**.

## What this changes from a double-blind venue submission

If we were submitting to a double-blind venue (e.g., FSE main track,
MSR Technical Papers), we would need to:

- Strip author names from the title block
- Replace self-citations like "(canary, github.com/heznpc/canary)" with
  third-person framing
- Anonymize the §5.4 vignette ("an indie developer's portfolio") instead
  of "the author's portfolio"
- Hide the Zenodo deposit identifier (which embeds author identity)

None of this applies to Onward! Essays.

## What we are intentionally leaving in (and why)

Because the venue is single-blind, the essay can directly:

1. **Cite the canary repo by URL** — reviewers can browse the
   artifact while reviewing.
2. **Use first-person "the author" framing** in §5.4 ("we observed
   23 of 57 repositories ahead of upstream...").
3. **Reference the Zenodo deposit** by DOI for replication of the
   exact vignette numbers.
4. **Cite the lifespan / ploidy companion papers** by author name.
5. **Use "heznpc" in code, file paths, and config examples** — the
   github.com/heznpc namespace is the author's, but mentioning it
   doesn't break review etiquette in a single-blind setting.

## What would still be improper

Even in single-blind, *self-promotion* is bad form. Restrict
self-citations to those that:

- Replicate a specific number (Zenodo deposit, canary commit hash)
- Acknowledge prior or companion work (`lifespan`, `ploidy`) only
  where the citation does load-bearing work
- Document the artifact (canary repo) for reviewer browsing

Avoid:

- Listing the toolkit identity (canary + AirMCP + ploidy +
  starter-series) in the body of the essay — that's a strategic
  framing for `planning/drafts/portfolio-identity.md`, not for the
  paper itself
- Repeating "the author's" more times than the argument requires
- Promotion of canary as a product

## Action item

Before submission, do one targeted pass through `main.tex` checking:

- [ ] Self-citations appear only where they earn their place
- [ ] No promotional language about the canary product/toolkit
- [ ] Companion-paper references (`lifespan`, `ploidy`) are warranted
  by argument, not portfolio politics
