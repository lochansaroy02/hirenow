"use client";

import { useRef, useState } from "react";
import type { ResumeUploadResult } from "@/types/campaign";

type ResumeUploaderProps = {
  value?: ResumeUploadResult;
  onUploaded: (result: ResumeUploadResult) => void;
};

function formatBytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function ResumeUploader({ value, onUploaded }: ResumeUploaderProps) {
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

      const response = await fetch("/api/upload-resume", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Resume upload failed.");
      }

      onUploaded(payload as ResumeUploadResult);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Resume upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">2. Upload resume</h2>
          <p className="mt-1 text-sm text-slate-600">PDF only, up to 5MB.</p>
        </div>
        <button
          type="button"
          className="h-10 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
        >
          {value ? "Replace PDF" : "Choose PDF"}
        </button>
      </div>

      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="application/pdf"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />

      {isUploading ? <p className="mt-4 text-sm text-slate-600">Uploading resume...</p> : null}
      {error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      {value ? (
        <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-medium">{value.filename}</p>
          <p className="mt-1 text-emerald-800">{formatBytes(value.size)}</p>
          {value.attachmentFilename ? (
            <p className="mt-2 text-emerald-800">Email attachment name: {value.attachmentFilename}</p>
          ) : null}
          {value.suggestedRole ? (
            <p className="mt-2 font-semibold">Detected role: {value.suggestedRole}</p>
          ) : null}
          {value.detectedSkills?.length ? (
            <p className="mt-1 text-emerald-800">Detected skills: {value.detectedSkills.join(", ")}</p>
          ) : null}
          {value.parseWarning ? (
            <p className="mt-2 rounded-md bg-amber-50 p-2 text-amber-800">{value.parseWarning}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
