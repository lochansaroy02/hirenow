import type { RecipientReportRow } from "@/types/campaign";

type RecipientTableProps = {
  recipients: RecipientReportRow[];
};

function statusClass(status: RecipientReportRow["status"]) {
  if (status === "SENT") {
    return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  }

  if (status === "FAILED") {
    return "bg-red-50 text-red-800 ring-red-200";
  }

  return "bg-amber-50 text-amber-800 ring-amber-200";
}

export function RecipientTable({ recipients }: RecipientTableProps) {
  const sentCount = recipients.filter((recipient) => recipient.emailSent).length;
  const pendingCount = recipients.filter((recipient) => !recipient.emailSent && recipient.status === "PENDING").length;
  const failedCount = recipients.filter((recipient) => recipient.status === "FAILED").length;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Recipient Tracking</h2>
            <p className="mt-1 text-sm text-slate-600">The sent flag is saved in Prisma and survives pause, refresh, and app restart.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold">
            <div className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800 ring-1 ring-emerald-200">
              <p className="text-lg">{sentCount}</p>
              <p>Sent</p>
            </div>
            <div className="rounded-md bg-amber-50 px-3 py-2 text-amber-800 ring-1 ring-amber-200">
              <p className="text-lg">{pendingCount}</p>
              <p>Pending</p>
            </div>
            <div className="rounded-md bg-red-50 px-3 py-2 text-red-800 ring-1 ring-red-200">
              <p className="text-lg">{failedCount}</p>
              <p>Failed</p>
            </div>
          </div>
        </div>
      </div>
      <div className="max-h-[560px] overflow-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Sent flag</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Attempts</th>
              <th className="px-3 py-2">Sent at</th>
              <th className="px-3 py-2">Last error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {recipients.map((recipient) => (
              <tr key={recipient.id}>
                <td className="px-3 py-2 font-medium text-slate-950">{recipient.name}</td>
                <td className="px-3 py-2 text-slate-700">{recipient.companyName}</td>
                <td className="px-3 py-2 text-slate-700">{recipient.hrEmail}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${
                    recipient.emailSent
                      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                      : "bg-slate-100 text-slate-700 ring-slate-200"
                  }`}>
                    {recipient.emailSent ? "Sent" : "Not sent"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${statusClass(recipient.status)}`}>
                    {recipient.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-700">{recipient.attempts}</td>
                <td className="px-3 py-2 text-slate-700">
                  {recipient.sentAt ? new Date(recipient.sentAt).toLocaleString() : "-"}
                </td>
                <td className="max-w-sm break-words px-3 py-2 text-red-700">{recipient.lastError ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
