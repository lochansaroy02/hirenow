"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ProgressBar } from "@/components/ProgressBar";
import { RecipientTable } from "@/components/RecipientTable";
import type { CampaignStatusResponse } from "@/types/campaign";

type DashboardClientProps = {
  campaignId: string;
};

function csvEscape(value: string | number | null) {
  const text = value === null ? "" : String(value);
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
    return "bg-teal-50 text-teal-800 ring-teal-200";
  }

  if (status === "COMPLETED") {
    return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  }

  if (status === "PAUSED") {
    return "bg-amber-50 text-amber-800 ring-amber-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export function DashboardClient({ campaignId }: DashboardClientProps) {
  const [status, setStatus] = useState<CampaignStatusResponse | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isPausing, setIsPausing] = useState(false);

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

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link className="text-sm font-medium text-teal-700 hover:text-teal-900" href="/">
            New campaign
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold text-slate-950">{status?.campaign.name ?? "Campaign"}</h1>
            {status ? (
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusPillClass(status.campaign.status)}`}>
                {status.campaign.status}
              </span>
            ) : null}
          </div>
          <p className="mt-1 break-words text-slate-600">{status?.campaign.subject ?? campaignId}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void startSending()}
            disabled={isStarting || status?.campaign.status === "COMPLETED" || status?.isRunning}
          >
          {isStarting ? "Starting..." : "Start / Resume Sending"}
          </button>
          <button
            type="button"
            className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void pauseSending()}
            disabled={isPausing || status?.campaign.status !== "ACTIVE"}
          >
            {isPausing ? "Pausing..." : "Pause"}
          </button>
          <button
            type="button"
            className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => status && downloadCsv(status)}
            disabled={!status}
          >
            Download Report
          </button>
        </div>
      </header>

      {error ? <p className="mb-5 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mb-5 rounded-md bg-teal-50 p-3 text-sm text-teal-800">{notice}</p> : null}
      {status?.needsResume ? (
        <p className="mb-5 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          This campaign was active but no sender is running now. Click Start / Resume Sending to continue from the first recipient whose sent flag is still No.
        </p>
      ) : null}

      {status ? (
        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
              <p className="mt-1 text-3xl font-semibold text-slate-950">{status.counts.total}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Sent</p>
              <p className="mt-1 text-3xl font-semibold text-emerald-950">{status.counts.sent}</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-red-700">Failed</p>
              <p className="mt-1 text-3xl font-semibold text-red-950">{status.counts.failed}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-amber-700">Pending</p>
              <p className="mt-1 text-3xl font-semibold text-amber-950">{status.counts.pending}</p>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <ProgressBar value={status.today.countSent} max={status.today.effectiveCap} />
              <p className="mt-3 text-sm text-slate-600">
                {status.today.remainingToday} sends remain for {status.today.date}. Resume path: {status.campaign.resumePath}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-800">Throttle settings</p>
              <p className="mt-2 text-sm text-slate-600">
                Provider limit {status.campaign.dailyLimit}, safety {status.campaign.safetyPercent}%, delay {status.campaign.delayMinSec}-{status.campaign.delayMaxSec}s.
              </p>
            </div>
          </section>

          <RecipientTable recipients={status.recipients} />
        </div>
      ) : (
        <p className="rounded-lg border border-slate-200 bg-white p-5 text-slate-600 shadow-sm">Loading campaign...</p>
      )}
    </main>
  );
}
