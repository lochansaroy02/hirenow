"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CAMPAIGN_DRAFT_STORAGE_KEY } from "@/lib/storageKeys";
import { mergePlaceholders } from "@/lib/placeholders";
import type { CampaignDraft, CsvUploadResult, SavedContact } from "@/types/campaign";

const RECIPIENT_PLACEHOLDERS = ["{{name}}", "{{hr_name}}", "{{company_name}}"];
const CONTACT_PLACEHOLDERS = ["{{your_email}}", "{{your_phone}}", "{{linkedin_url}}", "{{github_url}}"];
const DEFAULT_SUBJECT = "Application for Full Stack Developer Opportunities";
const DEFAULT_BODY = `Dear HR Team,

I hope you are doing well.

I am writing to express my interest in any current or upcoming Full Stack Developer opportunities at your organization.

I have recently completed my B.Tech in Computer Science and have hands-on experience building full-stack web and mobile applications using technologies such as Next.js, React, TypeScript, Node.js, Express.js, PostgreSQL, Prisma, and React Native (Expo).

One of my key projects is a Digital Malkhana Management System developed for the Uttar Pradesh Police, where I worked on the complete development lifecycle, including frontend, backend, database design, deployment, and mobile application development. This project is currently being used across multiple police stations.

I have attached my resume for your review. I would be grateful if you could consider my profile for any relevant Full Stack Developer openings that match my skills and experience.

Thank you for your time and consideration. I look forward to the opportunity to discuss how I can contribute to your team.

Kind regards,

Lochan Saroy
Email: {{your_email}}
Phone: {{your_phone}}
LinkedIn: {{linkedin_url}}
GitHub: {{github_url}}`;

function mergeContactPlaceholders(template: string, contact: ContactDetails) {
  return template
    .replaceAll("{{your_email}}", contact.email || "[Your Email]")
    .replaceAll("{{your_phone}}", contact.phone || "[Your Phone Number]")
    .replaceAll("{{linkedin_url}}", contact.linkedin || "[LinkedIn Profile]")
    .replaceAll("{{github_url}}", contact.github || "[GitHub Profile]");
}

type ContactDetails = {
  email: string;
  phone: string;
  linkedin: string;
  github: string;
};

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

export function ComposeForm() {
  const router = useRouter();
  const [draft, setDraft] = useState<CampaignDraft>({});
  const [campaignName, setCampaignName] = useState("Job Application Campaign");
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [contact, setContact] = useState<ContactDetails>({
    email: "",
    phone: "",
    linkedin: "",
    github: "",
  });
  const [dailyLimit, setDailyLimit] = useState(500);
  const [safetyPercent, setSafetyPercent] = useState(80);
  const [delayMinSec, setDelayMinSec] = useState(8);
  const [delayMaxSec, setDelayMaxSec] = useState(20);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const stored = window.localStorage.getItem(CAMPAIGN_DRAFT_STORAGE_KEY);
      if (stored) {
        const parsedDraft = JSON.parse(stored) as CampaignDraft;
        setDraft(parsedDraft);

        if (!parsedDraft.csv?.validRows.length) {
          void fetch("/api/contacts")
            .then((response) => response.json())
            .then((payload: { contacts?: SavedContact[] }) => {
              const contacts = payload.contacts ?? [];
              if (contacts.length > 0) {
                const nextDraft = { ...parsedDraft, csv: contactsToCsvResult(contacts) };
                setDraft(nextDraft);
                window.localStorage.setItem(CAMPAIGN_DRAFT_STORAGE_KEY, JSON.stringify(nextDraft));
              }
            });
        }
      } else {
        void fetch("/api/contacts")
          .then((response) => response.json())
          .then((payload: { contacts?: SavedContact[] }) => {
            const contacts = payload.contacts ?? [];
            if (contacts.length > 0) {
              const nextDraft = { csv: contactsToCsvResult(contacts) };
              setDraft(nextDraft);
              window.localStorage.setItem(CAMPAIGN_DRAFT_STORAGE_KEY, JSON.stringify(nextDraft));
            }
          });
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  const sampleRow = draft.csv?.validRows[0];
  const effectiveCap = Math.floor((dailyLimit * safetyPercent) / 100);

  const preview = useMemo(() => {
    if (!sampleRow) {
      return { subject: "", body: "" };
    }

    return {
      subject: mergePlaceholders(subject, sampleRow),
      body: mergePlaceholders(mergeContactPlaceholders(body, contact), sampleRow),
    };
  }, [body, contact, sampleRow, subject]);

  function insertPlaceholder(placeholder: string) {
    setBody((current) => `${current}${current.endsWith(" ") || current.endsWith("\n") ? "" : " "}${placeholder}`);
  }

  async function createCampaign() {
    setError("");

    if (!draft.csv?.validRows.length || !draft.resume) {
      setError("Import saved contacts and upload a resume PDF before creating a campaign.");
      return;
    }

    if (delayMaxSec < delayMinSec) {
      setError("Maximum delay must be greater than or equal to minimum delay.");
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch("/api/campaign/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName,
          subject,
          body: mergeContactPlaceholders(body, contact),
          resumePath: draft.resume.resumePath,
          dailyLimit,
          safetyPercent,
          delayMinSec,
          delayMaxSec,
          recipients: draft.csv.validRows,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Campaign creation failed.");
      }

      window.localStorage.removeItem(CAMPAIGN_DRAFT_STORAGE_KEY);
      router.push(`/dashboard/${payload.campaignId}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Campaign creation failed.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link className="text-sm font-medium text-teal-700 hover:text-teal-900" href="/">
            Back to uploads
          </Link>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Compose email</h1>
          <p className="mt-1 text-slate-600">
            {draft.csv?.validCount ?? 0} valid recipients, resume {draft.resume?.filename ?? "not uploaded"}.
          </p>
          {draft.resume?.attachmentFilename ? (
            <p className="mt-1 text-sm font-medium text-teal-700">
              Attachment will be sent as {draft.resume.attachmentFilename}.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => void createCampaign()}
          disabled={isCreating}
        >
          {isCreating ? "Creating..." : "Create Campaign"}
        </button>
      </header>

      {error ? <p className="mb-5 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="space-y-5">
            <label className="block">
              <span className="text-sm font-medium text-slate-800">Campaign name</span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-slate-950 outline-none focus:border-teal-600"
                value={campaignName}
                onChange={(event) => setCampaignName(event.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-800">Subject</span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-slate-950 outline-none focus:border-teal-600"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </label>

            <div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-medium text-slate-800">Body</span>
                <div className="flex flex-wrap gap-2">
                  {[...RECIPIENT_PLACEHOLDERS, ...CONTACT_PLACEHOLDERS].map((placeholder) => (
                    <button
                      key={placeholder}
                      type="button"
                      className="h-8 rounded-md border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      onClick={() => insertPlaceholder(placeholder)}
                    >
                      {placeholder}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                className="mt-2 min-h-80 w-full resize-y rounded-md border border-slate-300 p-3 text-slate-950 outline-none focus:border-teal-600"
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </div>

            <div className="grid gap-4 rounded-md border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-800">Your email</span>
                <input
                  className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-slate-950 outline-none focus:border-teal-600"
                  placeholder="you@example.com"
                  value={contact.email}
                  onChange={(event) => setContact((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-800">Phone number</span>
                <input
                  className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-slate-950 outline-none focus:border-teal-600"
                  placeholder="+91 ..."
                  value={contact.phone}
                  onChange={(event) => setContact((current) => ({ ...current, phone: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-800">LinkedIn profile</span>
                <input
                  className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-slate-950 outline-none focus:border-teal-600"
                  placeholder="https://linkedin.com/in/..."
                  value={contact.linkedin}
                  onChange={(event) => setContact((current) => ({ ...current, linkedin: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-800">GitHub profile</span>
                <input
                  className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-slate-950 outline-none focus:border-teal-600"
                  placeholder="https://github.com/..."
                  value={contact.github}
                  onChange={(event) => setContact((current) => ({ ...current, github: event.target.value }))}
                />
              </label>
            </div>
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Live preview</h2>
            {sampleRow ? (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Subject</p>
                  <p className="mt-1 break-words rounded-md bg-slate-50 p-3 text-sm font-medium text-slate-950">{preview.subject}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Body</p>
                  <pre className="mt-1 whitespace-pre-wrap break-words rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-800">
                    {preview.body}
                  </pre>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-600">Upload a valid CSV first.</p>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Sending settings</h2>
            <div className="mt-4 grid gap-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-800">Daily provider limit</span>
                <input
                  className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-slate-950 outline-none focus:border-teal-600"
                  type="number"
                  min={1}
                  value={dailyLimit}
                  onChange={(event) => setDailyLimit(Number(event.target.value))}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-800">Safety percent</span>
                <input
                  className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-slate-950 outline-none focus:border-teal-600"
                  type="number"
                  min={1}
                  max={100}
                  value={safetyPercent}
                  onChange={(event) => setSafetyPercent(Number(event.target.value))}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm font-medium text-slate-800">Min delay</span>
                  <input
                    className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-slate-950 outline-none focus:border-teal-600"
                    type="number"
                    min={0}
                    value={delayMinSec}
                    onChange={(event) => setDelayMinSec(Number(event.target.value))}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-800">Max delay</span>
                  <input
                    className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-slate-950 outline-none focus:border-teal-600"
                    type="number"
                    min={0}
                    value={delayMaxSec}
                    onChange={(event) => setDelayMaxSec(Number(event.target.value))}
                  />
                </label>
              </div>
            </div>
            <p className="mt-4 rounded-md bg-teal-50 p-3 text-sm font-medium text-teal-900">
              You will send up to {effectiveCap} emails/day.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
