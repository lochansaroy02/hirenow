"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CAMPAIGN_DRAFT_STORAGE_KEY, INSTRUCTIONS_SEEN_STORAGE_KEY } from "@/lib/storageKeys";
import type { CampaignDraft, CsvUploadResult, ResumeUploadResult, SavedContact } from "@/types/campaign";
import { CsvUploader } from "@/components/CsvUploader";
import { InstructionsModal } from "@/components/InstructionsModal";
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
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);

  // Read after mount so the server and client render the same first pass.
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!window.localStorage.getItem(INSTRUCTIONS_SEEN_STORAGE_KEY)) {
        setIsInstructionsOpen(true);
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  const closeInstructions = useCallback(() => {
    setIsInstructionsOpen(false);
    window.localStorage.setItem(INSTRUCTIONS_SEEN_STORAGE_KEY, "true");
  }, []);

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
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium uppercase tracking-wide text-teal-700">HireNow</p>
          <h1 className="text-3xl font-semibold text-slate-950">Hiring outreach, neatly tracked</h1>
          <p className="max-w-3xl text-slate-600">
            Import HR contacts once, save them in the database, attach your resume, then send in a throttled batch with a daily safety cap.
          </p>
          <p className="text-sm font-medium text-teal-700">
            Saved contacts in database: {savedContactsCount}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            onClick={() => setIsInstructionsOpen(true)}
          >
            Setup guide
          </button>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            href="/dashboard"
          >
            Mail dashboard
          </Link>
        </div>
      </header>

      <InstructionsModal open={isInstructionsOpen} onClose={closeInstructions} />

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
