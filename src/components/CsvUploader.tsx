"use client";

import { useRef, useState } from "react";
import type { CsvUploadResult } from "@/types/campaign";

type CsvUploaderProps = {
  value?: CsvUploadResult;
  onParsed: (result: CsvUploadResult) => void;
};

export function CsvUploader({ value, onParsed }: CsvUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }

    setError("");
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload-csv", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "CSV upload failed.");
      }

      onParsed(payload as CsvUploadResult);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "CSV upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">1. Import Excel / CSV contacts</h2>
          <p className="mt-1 text-sm text-slate-600">
            Required columns: name, company_name, hr_email, hr_name. Valid rows are saved to the database.
          </p>
        </div>
        <button
          type="button"
          className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
        >
          {value ? "Import another file" : "Choose file"}
        </button>
      </div>

      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />

      {isUploading ? <p className="mt-4 text-sm text-slate-600">Importing contacts...</p> : null}
      {error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      {value ? (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total rows</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{value.totalRows}</p>
            </div>
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Valid rows</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-900">{value.validCount}</p>
            </div>
            <div className="rounded-md border border-teal-200 bg-teal-50 p-3">
              <p className="text-xs uppercase tracking-wide text-teal-700">Saved contacts</p>
              <p className="mt-1 text-2xl font-semibold text-teal-900">{value.savedCount ?? value.contacts?.length ?? value.validCount}</p>
            </div>
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-xs uppercase tracking-wide text-red-700">Rows with errors</p>
              <p className="mt-1 text-2xl font-semibold text-red-900">{value.invalidRows.length}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">HR email</th>
                  <th className="px-3 py-2">HR name</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {value.previewRows.map((row, index) => (
                  <tr key={`${row.hr_email}-${index}`}>
                    <td className="px-3 py-2 text-slate-900">{row.name}</td>
                    <td className="px-3 py-2 text-slate-700">{row.company_name}</td>
                    <td className="px-3 py-2 text-slate-700">{row.hr_email}</td>
                    <td className="px-3 py-2 text-slate-700">{row.hr_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {value.invalidRows.length > 0 ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4">
              <h3 className="text-sm font-semibold text-red-900">Rows with errors</h3>
              <div className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-2 text-sm text-red-800">
                {value.invalidRows.map((row) => (
                  <p key={row.rowNumber}>
                    Row {row.rowNumber}: {row.errors.join(", ")}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
