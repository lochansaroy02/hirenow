"use client";

import { emailsPerHour, matchPreset, PACING_PRESETS, pacingWarning, type Pacing } from "@/lib/pacing";

type PacingEditorProps = {
  value: Pacing;
  onChange: (value: Pacing) => void;
  disabled?: boolean;
};

const inputClass =
  "mt-2 h-10 w-full rounded-md border border-input px-3 text-foreground outline-none focus:border-ring disabled:opacity-60";

const FIELDS: { key: keyof Pacing; label: string; min: number }[] = [
  { key: "delayMinSec", label: "Min delay (sec)", min: 0 },
  { key: "delayMaxSec", label: "Max delay (sec)", min: 0 },
  { key: "batchSize", label: "Batch size", min: 1 },
  { key: "batchCooldownMin", label: "Cooldown (min)", min: 0 },
];

/** Preset buttons plus the four pacing fields, with a live rate estimate. */
export function PacingEditor({ value, onChange, disabled }: PacingEditorProps) {
  const activePreset = matchPreset(value);
  const warning = pacingWarning(value);

  return (
    <div className="grid gap-4">
      <div>
        <span className="text-sm font-medium text-foreground">Pace</span>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {PACING_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={preset.hint}
              disabled={disabled}
              aria-pressed={activePreset?.id === preset.id}
              className={`h-9 rounded-md border px-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
                activePreset?.id === preset.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input text-foreground hover:bg-muted"
              }`}
              onClick={() => {
                const { delayMinSec, delayMaxSec, batchSize, batchCooldownMin } = preset;
                onChange({ delayMinSec, delayMaxSec, batchSize, batchCooldownMin });
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{activePreset ? activePreset.hint : "Custom pace."}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map((field) => (
          <label key={field.key} className="block">
            <span className="text-sm font-medium text-foreground">{field.label}</span>
            <input
              className={inputClass}
              type="number"
              min={field.min}
              disabled={disabled}
              value={value[field.key]}
              onChange={(event) => onChange({ ...value, [field.key]: Number(event.target.value) })}
            />
          </label>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        Waits a random {value.delayMinSec}–{value.delayMaxSec} seconds between emails and rests{" "}
        {value.batchCooldownMin} minutes after every {value.batchSize}. About{" "}
        <span className="font-semibold text-foreground">{emailsPerHour(value)} emails an hour</span>.
      </p>

      {warning ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{warning}</p>
      ) : null}
    </div>
  );
}
