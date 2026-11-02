// How fast a campaign sends. Shared by the compose screen, the campaign page, and
// the API so presets and limits are defined once.

export type Pacing = {
  delayMinSec: number;
  delayMaxSec: number;
  batchSize: number;
  batchCooldownMin: number;
};

export type PacingPreset = Pacing & { id: string; label: string; hint: string };

// Gmail looks for bursts and for machine-regular timing. Every preset waits a
// random time between min and max, and rests between batches.
export const PACING_PRESETS: PacingPreset[] = [
  {
    id: "careful",
    label: "Careful",
    hint: "New or rarely used Gmail account. Slowest, least likely to be flagged.",
    delayMinSec: 90,
    delayMaxSec: 240,
    batchSize: 15,
    batchCooldownMin: 60,
  },
  {
    id: "balanced",
    label: "Balanced",
    hint: "Recommended for most accounts.",
    delayMinSec: 45,
    delayMaxSec: 120,
    batchSize: 25,
    batchCooldownMin: 30,
  },
  {
    id: "steady",
    label: "Steady",
    hint: "Established account with a good sending history.",
    delayMinSec: 20,
    delayMaxSec: 60,
    batchSize: 40,
    batchCooldownMin: 20,
  },
];

export const DEFAULT_PACING: Pacing = PACING_PRESETS[1];

const MAX_DELAY_SEC = 3600;

/** The preset these values match exactly, if any. */
export function matchPreset(pacing: Pacing) {
  return PACING_PRESETS.find(
    (preset) =>
      preset.delayMinSec === pacing.delayMinSec &&
      preset.delayMaxSec === pacing.delayMaxSec &&
      preset.batchSize === pacing.batchSize &&
      preset.batchCooldownMin === pacing.batchCooldownMin,
  );
}

/** Returns an error message, or null when the values are usable. */
export function validatePacing(pacing: Pacing) {
  const { delayMinSec, delayMaxSec, batchSize, batchCooldownMin } = pacing;

  if (!Number.isInteger(delayMinSec) || !Number.isInteger(delayMaxSec) || delayMinSec < 0 || delayMaxSec < delayMinSec) {
    return "Delay range must be whole seconds, with max at least min.";
  }

  if (delayMaxSec > MAX_DELAY_SEC) {
    return `Max delay can be at most ${MAX_DELAY_SEC} seconds.`;
  }

  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 2000) {
    return "Batch size must be an integer between 1 and 2000.";
  }

  if (!Number.isInteger(batchCooldownMin) || batchCooldownMin < 0 || batchCooldownMin > 1440) {
    return "Batch cooldown must be between 0 and 1440 minutes.";
  }

  return null;
}

/** Roughly how many emails an hour these settings send, averaged over batches. */
export function emailsPerHour(pacing: Pacing) {
  const averageDelaySec = (pacing.delayMinSec + pacing.delayMaxSec) / 2;
  const batchSeconds = pacing.batchSize * averageDelaySec + pacing.batchCooldownMin * 60;

  return batchSeconds > 0 ? Math.round((pacing.batchSize * 3600) / batchSeconds) : pacing.batchSize * 3600;
}

/** A readable warning when settings look burst-like to Gmail, or null. */
export function pacingWarning(pacing: Pacing) {
  if (pacing.delayMaxSec < 15) {
    return "Under 15 seconds between emails looks automated to Gmail and risks the account being flagged.";
  }

  if (pacing.delayMaxSec - pacing.delayMinSec < 10) {
    return "A narrow delay range makes timing regular. Leave at least 10 seconds between min and max.";
  }

  if (emailsPerHour(pacing) > 80) {
    return "More than about 80 emails an hour is fast for one Gmail account. Consider a longer cooldown.";
  }

  return null;
}
