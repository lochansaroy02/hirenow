import { describe, expect, it } from "vitest";
import { DEFAULT_PACING, emailsPerHour, matchPreset, PACING_PRESETS, pacingWarning, validatePacing } from "@/lib/pacing";

describe("pacing", () => {
  it("accepts every preset without a warning", () => {
    for (const preset of PACING_PRESETS) {
      expect(validatePacing(preset)).toBeNull();
      expect(pacingWarning(preset)).toBeNull();
    }
  });

  it("rejects max below min and delays over an hour", () => {
    expect(validatePacing({ ...DEFAULT_PACING, delayMinSec: 60, delayMaxSec: 30 })).not.toBeNull();
    expect(validatePacing({ ...DEFAULT_PACING, delayMaxSec: 3601 })).not.toBeNull();
  });

  it("warns on burst-like settings", () => {
    expect(pacingWarning({ ...DEFAULT_PACING, delayMinSec: 2, delayMaxSec: 5 })).toMatch(/15 seconds/);
    expect(pacingWarning({ ...DEFAULT_PACING, delayMinSec: 60, delayMaxSec: 62 })).toMatch(/narrow/);
  });

  it("estimates hourly rate including the batch rest", () => {
    // 10 emails at an average 30s (300s) plus a 5 minute rest = 10 emails per 600s.
    expect(emailsPerHour({ delayMinSec: 20, delayMaxSec: 40, batchSize: 10, batchCooldownMin: 5 })).toBe(60);
  });

  it("recognises a preset and treats edits as custom", () => {
    expect(matchPreset(DEFAULT_PACING)?.id).toBe("balanced");
    expect(matchPreset({ ...DEFAULT_PACING, batchSize: 26 })).toBeUndefined();
  });
});
