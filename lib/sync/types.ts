/**
 * Configuration for the portfolio sync exporter (`/api/sync`).
 *
 * Everything here lives outside the canary library proper — it's the user's
 * data, not the tool's data. The exporter only emits a payload if the user
 * provides a `syncConfig` in `canary.config.ts`.
 */
export interface SyncMeta {
  name: string;
  tagline: string;
  bio: string;
  thesis?: string;
  github: string;
  contact?: string;
}

export interface SyncStarter {
  name: string;
  deployTo: string;
  repo: string;
}

export interface SyncConfig {
  meta: SyncMeta;
  /** Project IDs that should be marked tier=1 (flagship). All others default to tier=2 unless archived/prototype. */
  flagshipIds?: string[];
  /** Optional starter templates list to surface alongside the projects array. */
  starters?: SyncStarter[];
}
