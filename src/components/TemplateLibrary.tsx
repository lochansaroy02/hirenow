"use client";

import { useCallback, useEffect, useState } from "react";
import type { SavedResumeEntry, SavedTemplate } from "@/types/campaign";

type Draft = {
  name: string;
  subject: string;
  body: string;
  senderEmail: string;
  senderPhone: string;
  linkedinUrl: string;
  githubUrl: string;
};

const EMPTY: Draft = {
  name: "",
  subject: "",
  body: "",
  senderEmail: "",
  senderPhone: "",
  linkedinUrl: "",
  githubUrl: "",
};

const PLACEHOLDERS = [
  "{{name}}", "{{hr_name}}", "{{company_name}}",
  "{{your_email}}", "{{your_phone}}", "{{linkedin_url}}", "{{github_url}}",
];

function formatBytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatWhen(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "never";
}

export function TemplateLibrary() {
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [resumes, setResumes] = useState<SavedResumeEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [t, r] = await Promise.all([
        fetch("/api/templates").then((res) => res.json()),
        fetch("/api/resumes").then((res) => res.json()),
      ]);
      setTemplates(t.templates ?? []);
      setResumes(r.resumes ?? []);
    } catch {
      setError("Unable to load the library.");
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  function openTemplate(template: SavedTemplate) {
    setSelectedId(template.id);
    setDraft({
      name: template.name,
      subject: template.subject,
      body: template.body,
      senderEmail: template.senderEmail ?? "",
      senderPhone: template.senderPhone ?? "",
      linkedinUrl: template.linkedinUrl ?? "",
      githubUrl: template.githubUrl ?? "",
    });
    setError("");
    setNotice("");
  }

  function startNew() {
    setSelectedId(null);
    setDraft(EMPTY);
    setError("");
    setNotice("");
  }

  async function save() {
    setError("");
    setNotice("");

    if (!draft.name.trim() || !draft.subject.trim() || !draft.body.trim()) {
      setError("Name, subject, and body are all required.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(selectedId ? `/api/templates/${selectedId}` : "/api/templates", {
        method: selectedId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save template.");
      }

      setSelectedId(payload.template.id);
      setNotice(`Saved "${payload.template.name}".`);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save template.");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeTemplate(template: SavedTemplate) {
    if (!window.confirm(`Delete the template "${template.name}"? This cannot be undone.`)) {
      return;
    }

    await fetch(`/api/templates/${template.id}`, { method: "DELETE" });

    if (selectedId === template.id) {
      startNew();
    }

    setNotice(`Deleted "${template.name}".`);
    await load();
  }

  async function makeDefaultTemplate(template: SavedTemplate) {
    await fetch(`/api/templates/${template.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    await load();
  }

  async function updateResume(resume: SavedResumeEntry, patch: Record<string, unknown>) {
    await fetch(`/api/resumes/${resume.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await load();
  }

  async function removeResume(resume: SavedResumeEntry) {
    if (!window.confirm(`Remove "${resume.label}" from the library? The file itself stays in storage.`)) {
      return;
    }

    await fetch(`/api/resumes/${resume.id}`, { method: "DELETE" });
    setNotice(`Removed "${resume.label}" from the library.`);
    await load();
  }

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-col gap-3 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className=" text-3xl font-semibold text-foreground">Templates &amp; resumes</h1>
          <p className="mt-1 text-muted-foreground">
            Write an email once and reuse it. Resumes you upload are kept here so you never upload the same PDF twice.
          </p>
        </div>
        <button
          type="button"
          className="h-10 shrink-0 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          onClick={startNew}
        >
          New template
        </button>
      </header>

      {error ? <p className="mb-5 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mb-5 rounded-md bg-primary/10 p-3 text-sm text-primary">{notice}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Email templates ({templates.length})
              </h2>
            </div>
            {templates.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                No templates yet. Fill in the form and save one, or use “Save as template” on the compose screen.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {templates.map((template) => (
                  <li
                    key={template.id}
                    className={`px-4 py-3 ${selectedId === template.id ? "bg-primary/10" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        className="text-left"
                        onClick={() => openTemplate(template)}
                      >
                        <span className="font-medium text-foreground">{template.name}</span>
                        {template.isDefault ? (
                          <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                            default
                          </span>
                        ) : null}
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{template.subject}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          last used {formatWhen(template.lastUsedAt)}
                        </span>
                      </button>
                      <div className="flex shrink-0 flex-col gap-1">
                        {!template.isDefault ? (
                          <button
                            type="button"
                            className="text-xs font-medium text-primary hover:text-primary"
                            onClick={() => void makeDefaultTemplate(template)}
                          >
                            Set default
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="text-xs font-medium text-red-700 hover:text-red-900"
                          onClick={() => void removeTemplate(template)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Saved resumes ({resumes.length})
              </h2>
            </div>
            {resumes.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                No resumes yet. The next PDF you upload is saved here automatically.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {resumes.map((resume) => (
                  <li key={resume.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">
                          {resume.label}
                          {resume.isDefault ? (
                            <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                              default
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {resume.originalFilename} · {formatBytes(resume.fileSize)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">last used {formatWhen(resume.lastUsedAt)}</p>
                        {resume.resumePath.startsWith("http") ? (
                          <a
                            className="mt-1 inline-block text-xs font-medium text-primary underline underline-offset-2"
                            href={resume.resumePath}
                            target="_blank"
                            rel="noreferrer"
                          >
                            open PDF
                          </a>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        {!resume.isDefault ? (
                          <button
                            type="button"
                            className="text-xs font-medium text-primary hover:text-primary"
                            onClick={() => void updateResume(resume, { isDefault: true })}
                          >
                            Set default
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="text-xs font-medium text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            const label = window.prompt("Rename this resume", resume.label);
                            if (label && label.trim()) void updateResume(resume, { label });
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="text-xs font-medium text-red-700 hover:text-red-900"
                          onClick={() => void removeResume(resume)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">
            {selectedId ? "Edit template" : "New template"}
          </h2>

          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-foreground">Template name</span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-input px-3 text-foreground outline-none focus:border-ring"
                placeholder="Full Stack Developer outreach"
                value={draft.name}
                onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-foreground">Subject</span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-input px-3 text-foreground outline-none focus:border-ring"
                value={draft.subject}
                onChange={(event) => setDraft((d) => ({ ...d, subject: event.target.value }))}
              />
            </label>

            <div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">Body</span>
                <div className="flex flex-wrap gap-2">
                  {PLACEHOLDERS.map((placeholder) => (
                    <button
                      key={placeholder}
                      type="button"
                      className="h-8 rounded-md border border-input px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          body: `${d.body}${d.body.endsWith(" ") || d.body.endsWith("\n") || !d.body ? "" : " "}${placeholder}`,
                        }))
                      }
                    >
                      {placeholder}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                className="mt-2 min-h-96 w-full resize-y rounded-md border border-input p-3 text-foreground outline-none focus:border-ring"
                value={draft.body}
                onChange={(event) => setDraft((d) => ({ ...d, body: event.target.value }))}
              />
            </div>

            <div className="grid gap-4 rounded-md border border-border bg-muted p-4 sm:grid-cols-2">
              <p className="sm:col-span-2 text-xs text-muted-foreground">
                Saved with the template, so your own details are filled in automatically next time.
              </p>
              <label className="block">
                <span className="text-sm font-medium text-foreground">Your email</span>
                <input
                  className="mt-2 h-10 w-full rounded-md border border-input px-3 text-foreground outline-none focus:border-ring"
                  value={draft.senderEmail}
                  onChange={(event) => setDraft((d) => ({ ...d, senderEmail: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-foreground">Phone number</span>
                <input
                  className="mt-2 h-10 w-full rounded-md border border-input px-3 text-foreground outline-none focus:border-ring"
                  value={draft.senderPhone}
                  onChange={(event) => setDraft((d) => ({ ...d, senderPhone: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-foreground">LinkedIn profile</span>
                <input
                  className="mt-2 h-10 w-full rounded-md border border-input px-3 text-foreground outline-none focus:border-ring"
                  value={draft.linkedinUrl}
                  onChange={(event) => setDraft((d) => ({ ...d, linkedinUrl: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-foreground">GitHub profile</span>
                <input
                  className="mt-2 h-10 w-full rounded-md border border-input px-3 text-foreground outline-none focus:border-ring"
                  value={draft.githubUrl}
                  onChange={(event) => setDraft((d) => ({ ...d, githubUrl: event.target.value }))}
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="h-10 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void save()}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : selectedId ? "Save changes" : "Save template"}
              </button>
              {selectedId ? (
                <button
                  type="button"
                  className="h-10 rounded-md border border-input px-4 text-sm font-semibold text-foreground hover:bg-muted"
                  onClick={startNew}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
