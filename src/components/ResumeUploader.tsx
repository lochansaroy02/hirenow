"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResumeUploadResult, SavedResumeEntry } from "@/types/campaign";

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
  const [saved, setSaved] = useState<SavedResumeEntry[]>([]);

  const loadSaved = useCallback(() => {
    void fetch("/api/resumes")
      .then((response) => response.json())
      .then((payload: { resumes?: SavedResumeEntry[] }) => setSaved(payload.resumes ?? []))
      .catch(() => setSaved([]));
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(loadSaved, 0);
    return () => window.clearTimeout(timeout);
  }, [loadSaved]);

  // A saved resume is already in storage, so reusing it is just handing the
  // existing path back to the campaign draft. No upload, no re-analysis.
  function applySavedResume(entry: SavedResumeEntry) {
    onUploaded({
      savedResumeId: entry.id,
      resumePath: entry.resumePath,
      filename: entry.originalFilename,
      size: entry.fileSize,
      storage: entry.storage === "local" ? "local" : "imagekit",
      attachmentFilename: entry.attachmentFilename,
      suggestedRole: entry.suggestedRole ?? undefined,
      detectedSkills: entry.detectedSkills,
    });
  }

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
      loadSaved();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Resume upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">2. Upload resume</h2>
          <p className="mt-1 text-sm text-muted-foreground">PDF only, up to 5MB. Stored in ImageKit and attached to every email.</p>
        </div>
        <button
          type="button"
          className="h-10 rounded-md border border-input px-4 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
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

      {saved.length > 0 ? (
        <div className="mt-5 rounded-md border border-border bg-muted p-4">
          <p className="text-sm font-medium text-foreground">Reuse a saved resume</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Already in storage, so picking one attaches it straight away.
          </p>
          <ul className="mt-3 space-y-2">
            {saved.map((entry) => {
              const inUse = value?.resumePath === entry.resumePath;
              return (
                <li
                  key={entry.id}
                  className="flex flex-col gap-2 rounded-md border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {entry.label}
                      {entry.isDefault ? (
                        <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                          default
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{entry.originalFilename}</p>
                  </div>
                  <button
                    type="button"
                    className="h-9 shrink-0 rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => applySavedResume(entry)}
                    disabled={inUse}
                  >
                    {inUse ? "In use" : "Use this"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {isUploading ? <p className="mt-4 text-sm text-muted-foreground">Uploading resume...</p> : null}
      {error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      {value ? (
        <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-medium">{value.filename}</p>
          <p className="mt-1 text-emerald-800">{formatBytes(value.size)}</p>
          {value.attachmentFilename ? (
            <p className="mt-2 text-emerald-800">Email attachment name: {value.attachmentFilename}</p>
          ) : null}
          <p className="mt-2 text-emerald-800">
            Stored in {value.storage === "local" ? "this machine" : "ImageKit"}
            {value.resumePath.startsWith("http") ? (
              <>
                {" — "}
                <a
                  className="font-medium underline underline-offset-2 hover:text-emerald-950"
                  href={value.resumePath}
                  target="_blank"
                  rel="noreferrer"
                >
                  open file
                </a>
              </>
            ) : null}
          </p>
          {value.storageWarning ? (
            <p className="mt-2 rounded-md bg-amber-50 p-2 text-amber-800">{value.storageWarning}</p>
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
