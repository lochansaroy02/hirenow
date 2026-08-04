"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  MailListResponse,
  MailRow,
  MailSortOption,
  MailStatusFilter,
} from "@/types/campaign";

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
const EXPORT_LIMIT = 5000;
const REFRESH_INTERVAL_MS = 5000;

const STATUS_TABS: { value: MailStatusFilter; label: string }[] = [
  { value: "ALL", label: "All mails" },
  { value: "SENT", label: "Sent" },
  { value: "PENDING", label: "Pending" },
  { value: "FAILED", label: "Failed" },
];

const SORT_OPTIONS: { value: MailSortOption; label: string }[] = [
  { value: "newest", label: "Newest added" },
  { value: "oldest", label: "Oldest added" },
  { value: "recently_sent", label: "Recently sent" },
  { value: "company", label: "Company A-Z" },
];

function statusBadgeClass(status: MailRow["status"]) {
  if (status === "SENT") {
    return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  }

  if (status === "FAILED") {
    return "bg-red-50 text-red-800 ring-red-200";
  }

  return "bg-amber-50 text-amber-800 ring-amber-200";
}

function campaignPillClass(status: string) {
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

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function csvEscape(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function MailDashboard() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MailStatusFilter>("ALL");
  const [campaignId, setCampaignId] = useState("");
  const [sort, setSort] = useState<MailSortOption>("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const [data, setData] = useState<MailListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const buildQuery = useCallback(
    (overrides: Record<string, string> = {}) => {
      const params = new URLSearchParams({
        sort,
        page: String(page),
        pageSize: String(pageSize),
      });

      if (search) {
        params.set("q", search);
      }

      if (status !== "ALL") {
        params.set("status", status);
      }

      if (campaignId) {
        params.set("campaignId", campaignId);
      }

      for (const [key, value] of Object.entries(overrides)) {
        params.set(key, value);
      }

      return params.toString();
    },
    [campaignId, page, pageSize, search, sort, status],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(`/api/mails?${buildQuery()}`, { signal: controller.signal });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load sent mail history.");
        }

        setData(payload as MailListResponse);
        setError("");
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Unable to load sent mail history.");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [buildQuery, refreshIndex]);

  const isSending = data?.hasActiveSending ?? false;

  useEffect(() => {
    if (!autoRefresh || !isSending) {
      return;
    }

    const interval = window.setInterval(() => setRefreshIndex((current) => current + 1), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [autoRefresh, isSending]);

  const counts = useMemo(
    () => data?.counts ?? { total: 0, sent: 0, failed: 0, pending: 0 },
    [data],
  );
  const deliveryRate = counts.total > 0 ? Math.round((counts.sent / counts.total) * 100) : 0;

  const countForTab = useCallback(
    (tab: MailStatusFilter) => {
      if (tab === "SENT") return counts.sent;
      if (tab === "PENDING") return counts.pending;
      if (tab === "FAILED") return counts.failed;
      return counts.total;
    },
    [counts],
  );

  const rangeLabel = useMemo(() => {
    if (!data || data.totalFiltered === 0) {
      return "No mails match the current filters";
    }

    const first = (data.page - 1) * data.pageSize + 1;
    const last = Math.min(data.page * data.pageSize, data.totalFiltered);
    return `Showing ${first}-${last} of ${data.totalFiltered} mails`;
  }, [data]);

  async function exportCsv() {
    if (!data || data.totalFiltered === 0) {
      return;
    }

    setNotice("");

    try {
      const exportSize = Math.min(data.totalFiltered, EXPORT_LIMIT);
      const response = await fetch(`/api/mails?${buildQuery({ page: "1", pageSize: String(exportSize) })}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Export failed.");
      }

      const rows = (payload as MailListResponse).mails;
      const headers = [
        "recipient",
        "company",
        "hr_name",
        "hr_email",
        "campaign",
        "subject",
        "status",
        "email_sent",
        "attempts",
        "sent_at",
        "last_error",
      ];
      const csv = [
        headers,
        ...rows.map((mail) => [
          mail.name,
          mail.companyName,
          mail.hrName,
          mail.hrEmail,
          mail.campaign.name,
          mail.campaign.subject,
          mail.status,
          mail.emailSent ? "yes" : "no",
          mail.attempts,
          mail.sentAt,
          mail.lastError,
        ]),
      ]
        .map((row) => row.map((cell) => csvEscape(cell)).join(","))
        .join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "hirenow-mail-report.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      if (data.totalFiltered > EXPORT_LIMIT) {
        setNotice(`Exported the first ${EXPORT_LIMIT} of ${data.totalFiltered} mails. Narrow the filters to export the rest.`);
      }
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Export failed.");
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link className="text-sm font-medium text-teal-700 hover:text-teal-900" href="/">
            Back to uploads
          </Link>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Mail dashboard</h1>
          <p className="mt-1 text-slate-600">
            Every email HireNow has queued or sent, across all campaigns, with its delivery status.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 accent-teal-600"
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.checked)}
            />
            Auto refresh
          </label>
          <button
            type="button"
            className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            onClick={() => setRefreshIndex((current) => current + 1)}
          >
            Refresh
          </button>
          <button
            type="button"
            className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void exportCsv()}
            disabled={!data || data.totalFiltered === 0}
          >
            Download Report
          </button>
        </div>
      </header>

      {error ? <p className="mb-5 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mb-5 rounded-md bg-teal-50 p-3 text-sm text-teal-800">{notice}</p> : null}
      {isSending ? (
        <p className="mb-5 rounded-md bg-teal-50 p-3 text-sm text-teal-800">
          A campaign is sending right now. This table refreshes every {REFRESH_INTERVAL_MS / 1000} seconds while it runs.
        </p>
      ) : null}

      <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total mails</p>
          <p className="mt-1 text-3xl font-semibold text-slate-950">{counts.total}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-emerald-700">Sent</p>
          <p className="mt-1 text-3xl font-semibold text-emerald-950">{counts.sent}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-amber-700">Pending</p>
          <p className="mt-1 text-3xl font-semibold text-amber-950">{counts.pending}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-red-700">Failed</p>
          <p className="mt-1 text-3xl font-semibold text-red-950">{counts.failed}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Sent rate</p>
          <p className="mt-1 text-3xl font-semibold text-slate-950">{deliveryRate}%</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${deliveryRate}%` }} />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-4">
          <div className="flex flex-wrap gap-2">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                className={`h-9 rounded-md px-3 text-sm font-semibold ring-1 transition-colors ${
                  status === tab.value
                    ? "bg-slate-950 text-white ring-slate-950"
                    : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"
                }`}
                onClick={() => {
                  setStatus(tab.value);
                  setPage(1);
                }}
              >
                {tab.label}
                <span className={`ml-2 text-xs font-medium ${status === tab.value ? "text-slate-300" : "text-slate-500"}`}>
                  {countForTab(tab.value)}
                </span>
              </button>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.7fr)]">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Search</span>
              <input
                className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-slate-950 outline-none focus:border-teal-600"
                placeholder="Name, company, HR name, or email"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Campaign</span>
              <select
                className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-teal-600"
                value={campaignId}
                onChange={(event) => {
                  setCampaignId(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All campaigns</option>
                {data?.campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name} ({campaign.recipientCount})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Sort by</span>
              <select
                className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-teal-600"
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as MailSortOption);
                  setPage(1);
                }}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Rows</span>
              <select
                className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-teal-600"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3 font-semibold">#</th>
                <th className="px-3 py-3 font-semibold">Recipient</th>
                <th className="px-3 py-3 font-semibold">Company</th>
                <th className="px-3 py-3 font-semibold">HR contact</th>
                <th className="px-3 py-3 font-semibold">Campaign</th>
                <th className="px-3 py-3 font-semibold">Mail status</th>
                <th className="px-3 py-3 font-semibold">Sent at</th>
                <th className="px-3 py-3 font-semibold">Attempts</th>
                <th className="px-3 py-3 font-semibold">Last error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && !data ? (
                <tr>
                  <td className="px-3 py-8 text-center text-slate-600" colSpan={9}>
                    Loading mails...
                  </td>
                </tr>
              ) : null}

              {data && data.mails.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-slate-600" colSpan={9}>
                    No mails match the current filters. Create a campaign to start sending.
                  </td>
                </tr>
              ) : null}

              {data?.mails.map((mail, index) => (
                <tr key={mail.id} className="align-top hover:bg-slate-50">
                  <td className="px-3 py-3 text-slate-500">{(data.page - 1) * data.pageSize + index + 1}</td>
                  <td className="px-3 py-3 font-medium text-slate-950">{mail.name}</td>
                  <td className="px-3 py-3 text-slate-700">{mail.companyName}</td>
                  <td className="px-3 py-3">
                    <p className="text-slate-900">{mail.hrName}</p>
                    <p className="text-xs text-slate-600">{mail.hrEmail}</p>
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      className="font-medium text-teal-700 hover:text-teal-900"
                      href={`/dashboard/${mail.campaign.id}`}
                    >
                      {mail.campaign.name}
                    </Link>
                    <span
                      className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${campaignPillClass(mail.campaign.status)}`}
                    >
                      {mail.campaign.status}
                    </span>
                    <p className="mt-1 max-w-xs truncate text-xs text-slate-500" title={mail.campaign.subject}>
                      {mail.campaign.subject}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusBadgeClass(mail.status)}`}
                    >
                      {mail.status === "SENT" ? "Sent" : mail.status === "FAILED" ? "Failed" : "Pending"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">{formatDateTime(mail.sentAt)}</td>
                  <td className="px-3 py-3 text-slate-700">{mail.attempts}</td>
                  <td className="max-w-sm wrap-break-word px-3 py-3 text-red-700">{mail.lastError ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">{rangeLabel}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-9 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={!data || data.page <= 1}
            >
              Previous
            </button>
            <span className="text-sm text-slate-600">
              Page {data?.page ?? 1} of {data?.totalPages ?? 1}
            </span>
            <button
              type="button"
              className="h-9 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => setPage((current) => current + 1)}
              disabled={!data || data.page >= data.totalPages}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
