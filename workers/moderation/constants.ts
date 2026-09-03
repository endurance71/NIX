/** C3B offline constants. Shared with spike budget semantics; no network. */

export const F0_MONTHLY_CAP = 5000;
/** Operational ceiling: leave 1000 of F0 5000 as untouchable reserve. */
export const F0_HARD_BUDGET = 4000;
/** Microsoft F0 Moderation APIs (text + image): 5 RPS. */
export const F0_MAX_RPS = 5;
/** Conservative spacing below 5 RPS. */
export const F0_MIN_REQUEST_GAP_MS = 200;
export const MAX_INPUT_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 180;
export const MAX_HYBRID_FRAMES = 120;
export const CLAIM_LIMIT = 1;
export const LEASE_SECONDS = 900;
export const PROCESS_TIMEOUT_MS = 600_000;
export const RETRY_SECONDS = [30, 120, 600, 3600] as const;
export const WAITING_BUDGET = "f0_budget_exhausted" as const;
export const TEMP_PREFIX = "nix-frame-";
