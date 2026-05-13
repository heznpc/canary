# Cover letter — Onward! Essays 2026

**Draft, not yet submitted. To be pasted into the Onward! submission
portal cover-letter field.**

---

Dear Onward! Essays 2026 program committee,

I am submitting *The Metadatafication of Version Control: How AI Agents
Transform Git from Tool to Infrastructure* for consideration.

The essay argues that Git is not dying but undergoing
*metadatafication* — a transition from directly-operated tool to
automatically-generated infrastructure metadata, analogous to the
trajectories of EXIF, DNS, TCP/IP, and compiler optimization. The
argument is grounded in Star and Ruhleder's 1996 infrastructure-studies
framework, particularly their "infrastructure becomes visible only upon
breakdown" claim, and extended with three empirical instances of that
breakdown observed in 2026 indie-and-agent software practice:

1. **Push-leakage**: agent-committed work that never propagates to remote
   until an external scan enumerates it. Documented in §5.4 with a
   single-developer N=57 vignette (Figure 1).
2. **Worktree-leakage**: stale IDE worktrees from already-merged pull
   requests, with parallel reports in Claude Code issues #26725 and
   #43730.
3. **Command-cleanup-leakage**: silent partial failure of
   `gh pr merge --delete-branch`, documented in GitHub CLI issues
   #12980 / #9073 / #11187.

The essay's contribution is to recognise these as a coherent class of
operator–tool topology failures predicted by metadatafication, and to
identify the design pattern they share: the operator-attention budget
that gh-aw-style server-side observability cannot reach by construction.

The companion artifact (Canary, at `paper/`'s parent repository) is an
open-source MCP server that operationalizes the measurement instruments
the essay cites. It is positioned in §5.1 as a reference implementation
of the §6.2 recommendation, not a product pitch; readers can replicate
all numbers in §5.4 from the Zenodo deposit cited there.

The essay fits Onward! Essays' explicit scope on *"software's
relationship to human endeavors, or its philosophical, sociological,
psychological, historical, or anthropological underpinnings"* through
its STS grounding and its treatment of the operator–agent attention
relationship.

I am the sole author. The work is unpublished and not under review
elsewhere.

Thank you for the consideration.

— heznpc
