"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CAMPAIGN_DRAFT_STORAGE_KEY } from "@/lib/storageKeys";
import type { CampaignDraft, CsvUploadResult, ResumeUploadResult, SavedContact } from "@/types/campaign";
import { CsvUploader } from "@/components/CsvUploader";
import { ResumeUploader } from "@/components/ResumeUploader";

function contactsToCsvResult(contacts: SavedContact[]): CsvUploadResult {
  const validRows = contacts.map((contact) => ({
    name: contact.name,
    company_name: contact.companyName,
    hr_email: contact.hrEmail,
    hr_name: contact.hrName,
  }));

  return {
    validRows,
    invalidRows: [],
    previewRows: validRows.slice(0, 20),
    validCount: validRows.length,
    totalRows: validRows.length,
    savedCount: contacts.length,
    contacts,
  };
}

export function HomeFlow() {
  const [draft, setDraft] = useState<CampaignDraft>({});
  const [savedContactsCount, setSavedContactsCount] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const stored = window.localStorage.getItem(CAMPAIGN_DRAFT_STORAGE_KEY);
      if (stored) {
        setDraft(JSON.parse(stored) as CampaignDraft);
      }

      void fetch("/api/contacts")
        .then((response) => response.json())
        .then((payload: { contacts?: SavedContact[] }) => {
          const contacts = payload.contacts ?? [];
          setSavedContactsCount(contacts.length);

          if (!stored && contacts.length > 0) {
            const nextDraft = { csv: contactsToCsvResult(contacts) };
            setDraft(nextDraft);
            window.localStorage.setItem(CAMPAIGN_DRAFT_STORAGE_KEY, JSON.stringify(nextDraft));
          }
        });
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  function updateDraft(nextDraft: CampaignDraft) {
    setDraft(nextDraft);
    window.localStorage.setItem(CAMPAIGN_DRAFT_STORAGE_KEY, JSON.stringify(nextDraft));
  }

  function handleCsv(csv: CsvUploadResult) {
    setSavedContactsCount(csv.savedCount ?? csv.contacts?.length ?? csv.validCount);
    updateDraft({ ...draft, csv });
  }

  function handleResume(resume: ResumeUploadResult) {
    updateDraft({ ...draft, resume });
  }

  const canCompose = Boolean(draft.csv?.validCount && draft.resume);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2 border-b border-slate-200 pb-5">
        <p className="text-sm font-medium uppercase tracking-wide text-teal-700">Local Gmail SMTP tool</p>
        <h1 className="text-3xl font-semibold text-slate-950">Bulk job-application mailer</h1>
        <p className="max-w-3xl text-slate-600">
          Import HR contacts once, save them in the database, attach your resume, then send in a throttled batch with a daily safety cap.
        </p>
        <p className="text-sm font-medium text-teal-700">
          Saved contacts in database: {savedContactsCount}
        </p>
      </header>

      <CsvUploader value={draft.csv} onParsed={handleCsv} />
      <ResumeUploader value={draft.resume} onUploaded={handleResume} />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">3. Compose campaign</h2>
            <p className="mt-1 text-sm text-slate-600">
              Continue once saved contacts are available and a resume PDF is uploaded.
            </p>
          </div>
          {canCompose ? (
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
              href="/compose"
            >
              Continue to compose
            </Link>
          ) : (
            <span className="inline-flex h-10 items-center rounded-md bg-slate-100 px-4 text-sm font-medium text-slate-500">
              Waiting for uploads
            </span>
          )}
        </div>
      </section>
    </main>
  );
}
