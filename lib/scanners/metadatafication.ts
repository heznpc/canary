import type {
  ContextAttention,
  AgentAuthorship,
  MetadataficationStatus,
} from "../types";

/**
 * Metadatafication phase classifier.
 *
 * Maps a project's CAM and ACR signals to one of the three phases defined in
 * §3.1 of the paper:
 *
 *   1. Active Tool          — Git operated directly by humans
 *   2. Assisted Tool        — Automation handles routine ops; humans monitor
 *   3. Infrastructure Metadata — Records generated automatically; agents act
 *
 * Cutoffs are derived from §5.4 reference data: traditional OSS shows mean
 * CAM ≈ 1% / mean ACR ≈ 5% in the 90d window, with developer-led Phase-2
 * adopters reaching CAM 2-7% and ACR 5-30%.
 */

const CAM_CREATION_MIN = 0.005;     // ≥0.5% commits touching agent files
const CAM_REFINEMENT_MIN = 0.02;    // ≥2% — meaningful editorial attention
const ACR_REFINEMENT_MIN = 0.05;    // ≥5% AI-authored

export function classifyMetadatafication(
  cam: ContextAttention | null,
  acr: AgentAuthorship | null,
): MetadataficationStatus | null {
  if (!cam && !acr) return null;

  const camValue = cam?.cam ?? 0;
  const acrValue = acr?.acr ?? 0;
  const hasAgentFiles = (cam?.agentEraFiles.length ?? 0) > 0;

  // Refinement: meaningful editorial attention OR substantial AI authorship
  if (camValue >= CAM_REFINEMENT_MIN || acrValue >= ACR_REFINEMENT_MIN) {
    const reasonParts: string[] = [];
    if (camValue >= CAM_REFINEMENT_MIN) {
      reasonParts.push(`CAM ${(camValue * 100).toFixed(1)}%`);
    }
    if (acrValue >= ACR_REFINEMENT_MIN) {
      reasonParts.push(`ACR ${(acrValue * 100).toFixed(1)}%`);
    }
    return {
      phase: "infrastructure-metadata",
      rationale: `Phase 3 — refinement (${reasonParts.join(", ")})`,
      progressScore: scorePhase3(camValue, acrValue),
    };
  }

  // Creation: agent files exist OR some agent commits are appearing
  if (hasAgentFiles || camValue >= CAM_CREATION_MIN || acrValue > 0) {
    const reasonParts: string[] = [];
    if (hasAgentFiles) {
      const fileCount = cam?.agentEraFiles.length ?? 0;
      reasonParts.push(`${fileCount} agent file${fileCount === 1 ? "" : "s"}`);
    }
    if (acrValue > 0) {
      reasonParts.push(`ACR ${(acrValue * 100).toFixed(1)}%`);
    }
    if (reasonParts.length === 0) {
      reasonParts.push(`CAM ${(camValue * 100).toFixed(1)}%`);
    }
    return {
      phase: "assisted-tool",
      rationale: `Phase 2 — creation (${reasonParts.join(", ")})`,
      progressScore: scorePhase2(camValue, acrValue, hasAgentFiles),
    };
  }

  // Active Tool: no agent footprint
  return {
    phase: "active-tool",
    rationale: "Phase 1 — no agent-era files or markers detected",
    progressScore: 0,
  };
}

function scorePhase2(cam: number, acr: number, hasFiles: boolean): number {
  // 1–34 range — early creation phase
  let score = hasFiles ? 10 : 0;
  score += Math.min(15, cam * 1000); // 1% CAM = +10, capped at +15
  score += Math.min(10, acr * 200);  // 5% ACR = +10
  return Math.round(Math.min(34, Math.max(1, score)));
}

function scorePhase3(cam: number, acr: number): number {
  // 35–100 range — refinement phase
  let score = 35;
  score += Math.min(35, (cam - 0.02) * 1000); // each +1% CAM beyond 2% = +10
  score += Math.min(30, acr * 100);            // 30% ACR = +30
  return Math.round(Math.min(100, Math.max(35, score)));
}
