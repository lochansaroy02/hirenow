"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ProgressBar } from "@/components/ProgressBar";
import { RecipientTable } from "@/components/RecipientTable";
import { PacingEditor } from "@/components/PacingEditor";
import { validatePacing, type Pacing } from "@/lib/pacing";
import type { CampaignStatusResponse } from "@/types/campaign";

type DashboardClientProps = {
  campaignId: string;
};

type PacingPanelProps = {
  campaignId: string;
  campaign: CampaignStatusResponse["campaign"];
  isRunning: boolean;
  onSaved: (message: string) => Promise<void>;
};

function pacingOf(campaign: CampaignStatusResponse["campaign"]): Pacing {
  const { delayMinSec, delayMaxSec, batchSize, batchCooldownMin } = campaign;
  return { delayMinSec, delayMaxSec, batchSize, batchCooldownMin };
}

/** Shows the campaign's pace, and lets it be changed at any time, even mid-send. */
function PacingPanel({ campaignId, campaign, isRunning, onSaved }: PacingPanelProps) {
  // null while not editing, so status polling keeps the read-only view fresh.
  const [draft, setDraft] = useState<Pacing | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const current = pacingOf(campaign);

  async function save() {
    if (!draft) {
      return;
    }

    const invalid = validatePacing(draft);

    if (invalid) {
      setError(invalid);
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/campaign/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update the pace.");
      }

      setDraft(null);
      await onSaved(
        isRunning
          ? "Pace updated. The wait in progress has been re-timed with the new delay."
          : "Pace updated.",
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update the pace.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">Sending pace</p>
        {draft ? null : (
          <button
            type="button"
            className="h-8 rounded-md border border-input px-3 text-sm font-semibold text-foreground hover:bg-muted"
            onClick={() => setDraft(current)}
          >
            Change
          </button>
        )}
      </div>

      {draft ? (
        <div className="mt-3">
          <PacingEditor value={draft} onChange={setDraft} disabled={isSaving} />
          {error ? <p className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="h-9 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              onClick={() => void save()}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save pace"}
            </button>
            <button
              type="button"
              className="h-9 rounded-md border border-input px-4 text-sm font-semibold text-foreground hover:bg-muted"
              onClick={() => {
                setDraft(null);
                setError("");
              }}
              disabled={isSaving}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Random {current.delayMinSec}–{current.delayMaxSec}s between emails. Batches of {current.batchSize}, {current.batchCooldownMin} min
            pause between them.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Provider limit {campaign.dailyLimit}, safety {campaign.safetyPercent}%.
          </p>
        </>
      )}
    </div>
  );
}

function csvEscape(value: string | number | null) {
  const raw = value === null ? "" : String(value);
  // Neutralise spreadsheet formulas (= + - @) carried in imported contact fields.
  const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(status: CampaignStatusResponse) {
  const headers = ["name", "company", "hr_email", "hr_name", "email_sent", "status", "attempts", "sent_at", "last_error"];
  const rows = status.recipients.map((recipient) => [
    recipient.name,
    recipient.companyName,
    recipient.hrEmail,
    recipient.hrName,
    recipient.emailSent ? "yes" : "no",
    recipient.status,
    recipient.attempts,
    recipient.sentAt,
    recipient.lastError,
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => csvEscape(cell)).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${status.campaign.name.replaceAll(" ", "-").toLowerCase()}-report.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function statusPillClass(status: string) {
  if (status === "ACTIVE") {
    return "bg-primary/10 text-primary ring-primary/30";
  }

  if (status === "COMPLETED") {
    return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  }

  if (status === "PAUSED") {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  return "bg-muted text-muted-foreground ring-border";
}

export function DashboardClient({ campaignId }: DashboardClientProps) {
  const [status, setStatus] = useState<CampaignStatusResponse | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/campaign/status?campaignId=${campaignId}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load status.");
      }

      setStatus(payload as CampaignStatusResponse);
      setError("");
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Unable to load status.");
    }
  }, [campaignId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadStatus();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadStatus]);

  useEffect(() => {
    if (!status || (status.campaign.status !== "ACTIVE" && !status.isRunning)) {
      return;
    }

    const interval = window.setInterval(() => {
      void loadStatus();
    }, 4000);

    return () => window.clearInterval(interval);
  }, [loadStatus, status]);

  async function startSending() {
    setIsStarting(true);
    setNotice("");
    setError("");

    try {
      const response = await fetch("/api/campaign/send-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to start sending.");
      }

      setNotice(payload.message ?? "Sending started.");
      await loadStatus();
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Unable to start sending.");
    } finally {
      setIsStarting(false);
    }
  }

  async function pauseSending() {
    setIsPausing(true);
    setNotice("");
    setError("");

    try {
      const response = await fetch(`/api/campaign/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PAUSED" }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to pause campaign.");
      }

      setNotice("Campaign paused. Any in-flight email finishes before the sender stops.");
      await loadStatus();
    } catch (pauseError) {
      setError(pauseError instanceof Error ? pauseError.message : "Unable to pause campaign.");
    } finally {
      setIsPausing(false);
    }
  }

  async function retryFailed() {
    setIsRetrying(true);
    setNotice("");
    setError("");

    try {
      const response = await fetch(`/api/campaign/${campaignId}/retry-failed`, { method: "POST" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to retry failed recipients.");
      }

      setNotice(`${payload.requeued} failed recipients are back in the queue. Click Start / Resume Sending to send them.`);
      await loadStatus();
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Unable to retry failed recipients.");
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-col gap-3 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className=" flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold text-foreground">{status?.campaign.name ?? "Campaign"}</h1>
            {status ? (
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusPillClass(status.campaign.status)}`}>
                {status.campaign.status}
              </span>
            ) : null}
          </div>
          <p className="mt-1 wrap-break-word text-muted-foreground">{status?.campaign.subject ?? campaignId}</p>
          {status ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {status.sender.gmailAddress
                ? `Sends from ${status.sender.gmailAddress}${status.sender.ownerName ? ` (${status.sender.ownerName})` : ""}`
                : "No Gmail account yet. It will send from the Gmail of whoever starts it first."}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void startSending()}
            disabled={isStarting || status?.campaign.status === "COMPLETED" || status?.isRunning}
          >
          {isStarting ? "Starting..." : "Start / Resume Sending"}
          </button>
          <button
            type="button"
            className="h-10 rounded-md border border-input px-4 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void pauseSending()}
            disabled={isPausing || status?.campaign.status !== "ACTIVE"}
          >
            {isPausing ? "Pausing..." : "Pause"}
          </button>
          <button
            type="button"
            className="h-10 rounded-md border border-input px-4 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void retryFailed()}
            disabled={isRetrying || !status?.counts.failed || status?.isRunning}
          >
            {isRetrying ? "Requeuing..." : "Retry failed"}
          </button>
          <button
            type="button"
            className="h-10 rounded-md border border-input px-4 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => status && downloadCsv(status)}
            disabled={!status}
          >
            Download Report
          </button>
        </div>
      </header>

      {error ? <p className="mb-5 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mb-5 rounded-md bg-primary/10 p-3 text-sm text-primary">{notice}</p> : null}
      {status?.campaign.pausedReason ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span>
            <span className="font-semibold">Sending stopped on its own.</span> {status.campaign.pausedReason}
          </span>
          <Link href="/settings" className="font-semibold underline underline-offset-2">
            Open Settings
          </Link>
        </div>
      ) : null}
      {status?.needsResume ? (
        <p className="mb-5 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          This campaign was active but no sender is running now. Click Start / Resume Sending to continue from the first recipient whose sent flag is still No.
        </p>
      ) : null}

      {status ? (
        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
              <p className="mt-1 text-3xl font-semibold text-foreground">{status.counts.total}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Sent</p>
              <p className="mt-1 text-3xl font-semibold text-emerald-950">{status.counts.sent}</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-red-700">Failed</p>
              <p className="mt-1 text-3xl font-semibold text-red-950">{status.counts.failed}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Skipped</p>
              <p className="mt-1 text-3xl font-semibold text-foreground">{status.counts.skipped}</p>
              <p className="mt-1 text-xs text-muted-foreground">Already emailed before</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-amber-700">Pending</p>
              <p className="mt-1 text-3xl font-semibold text-amber-950">{status.counts.pending}</p>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <ProgressBar value={status.today.countSent} max={status.today.effectiveCap} />
              <p className="mt-3 text-sm text-muted-foreground">
                {status.today.remainingToday} sends remain for {status.today.date}. This counts every campaign sent from
                your Gmail account today, because Gmail&apos;s limit is per account. Resume path: {status.campaign.resumePath}
              </p>
            </div>
            <div className="space-y-4">
              <PacingPanel
                campaignId={campaignId}
                campaign={status.campaign}
                isRunning={status.isRunning}
                onSaved={async (message) => {
                  setNotice(message);
                  await loadStatus();
                }}
              />
              {status.batch ? (
                <p className="rounded-md bg-primary/10 p-2 text-sm font-medium text-primary">
                  {status.batch.cooldownUntil
                    ? `Batch ${status.batch.batchNumber} done. Cooling down until ${new Date(status.batch.cooldownUntil).toLocaleTimeString()}.`
                    : `Batch ${status.batch.batchNumber} in progress — ${status.batch.doneInBatch} of ${status.campaign.batchSize} done.`}
                </p>
              ) : null}
            </div>
          </section>

          {status.recipients.length < status.counts.total - status.counts.sent ? (
            <p className="text-sm text-muted-foreground">
              Showing the first {status.recipients.length} queued recipients. The mail dashboard lists and exports all of them.
            </p>
          ) : null}
          <RecipientTable recipients={status.recipients} />
        </div>
      ) : (
        <p className="rounded-lg border border-border bg-card p-5 text-muted-foreground shadow-sm">Loading campaign...</p>
      )}
    </main>
  );
}
