"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CAMPAIGN_DRAFT_STORAGE_KEY } from "@/lib/storageKeys";
import { mergePlaceholders } from "@/lib/placeholders";
import { DEFAULT_PACING, validatePacing, type Pacing } from "@/lib/pacing";
import { PacingEditor } from "@/components/PacingEditor";
import type { CampaignDraft, CsvUploadResult, SavedContact, SavedTemplate } from "@/types/campaign";

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
  const [campaignName, setCampaignName] = useState("HireNow Campaign");
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
  const [pacing, setPacing] = useState<Pacing>(DEFAULT_PACING);
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
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

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetch("/api/templates")
        .then((response) => response.json())
        .then((payload: { templates?: SavedTemplate[] }) => {
          const list = payload.templates ?? [];
          setTemplates(list);

          // Start from the default template so a repeat campaign needs no typing.
          const fallback = list.find((entry) => entry.isDefault);
          if (fallback) {
            applyTemplate(fallback);
          }
        });
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  function applyTemplate(template: SavedTemplate) {
    setTemplateId(template.id);
    setSubject(template.subject);
    setBody(template.body);
    setContact({
      email: template.senderEmail ?? "",
      phone: template.senderPhone ?? "",
      linkedin: template.linkedinUrl ?? "",
      github: template.githubUrl ?? "",
    });
  }

  async function saveAsTemplate() {
    const name = window.prompt("Save this email as a template. Name it:", campaignName);

    if (!name || !name.trim()) {
      return;
    }

    setError("");

    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          subject,
          body,
          senderEmail: contact.email,
          senderPhone: contact.phone,
          linkedinUrl: contact.linkedin,
          githubUrl: contact.github,
          isDefault: templates.length === 0,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save template.");
      }

      setTemplates((current) => [...current, payload.template]);
      setTemplateId(payload.template.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save template.");
    }
  }

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

    const invalidPacing = validatePacing(pacing);

    if (invalidPacing) {
      setError(invalidPacing);
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
          ...pacing,
          recipients: draft.csv.validRows,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Campaign creation failed.");
      }

      if (templateId) {
        void fetch(`/api/templates/${templateId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markUsed: true }),
        });
      }

      if (draft.resume?.savedResumeId) {
        void fetch(`/api/resumes/${draft.resume.savedResumeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markUsed: true }),
        });
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
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link className="text-sm font-medium text-primary hover:text-primary" href="/">
            Back to uploads
          </Link>
          <h1 className="mt-2 text-3xl font-semibold text-foreground">Compose email</h1>
          <p className="mt-1 text-muted-foreground">
            {draft.csv?.validCount ?? 0} valid recipients, resume {draft.resume?.filename ?? "not uploaded"}.
          </p>
          {draft.resume?.attachmentFilename ? (
            <p className="mt-1 text-sm font-medium text-primary">
              Attachment will be sent as {draft.resume.attachmentFilename}.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus:border-ring"
            value={templateId}
            onChange={(event) => {
              const chosen = templates.find((entry) => entry.id === event.target.value);
              if (chosen) applyTemplate(chosen);
              else setTemplateId("");
            }}
          >
            <option value="">Start from scratch</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}{template.isDefault ? " (default)" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="h-10 rounded-md border border-input px-4 text-sm font-semibold text-foreground hover:bg-muted"
            onClick={() => void saveAsTemplate()}
          >
            Save as template
          </button>
          <button
            type="button"
            className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void createCampaign()}
            disabled={isCreating}
          >
            {isCreating ? "Creating..." : "Create Campaign"}
          </button>
        </div>
      </header>

      {error ? <p className="mb-5 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="space-y-5">
            <label className="block">
              <span className="text-sm font-medium text-foreground">Campaign name</span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-input px-3 text-foreground outline-none focus:border-ring"
                value={campaignName}
                onChange={(event) => setCampaignName(event.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-foreground">Subject</span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-input px-3 text-foreground outline-none focus:border-ring"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </label>

            <div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-medium text-foreground">Body</span>
                <div className="flex flex-wrap gap-2">
                  {[...RECIPIENT_PLACEHOLDERS, ...CONTACT_PLACEHOLDERS].map((placeholder) => (
                    <button
                      key={placeholder}
                      type="button"
                      className="h-8 rounded-md border border-input px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                      onClick={() => insertPlaceholder(placeholder)}
                    >
                      {placeholder}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                className="mt-2 min-h-80 w-full resize-y rounded-md border border-input p-3 text-foreground outline-none focus:border-ring"
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </div>

            <div className="grid gap-4 rounded-md border border-border bg-muted p-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-foreground">Your email</span>
                <input
                  className="mt-2 h-10 w-full rounded-md border border-input px-3 text-foreground outline-none focus:border-ring"
                  placeholder="you@example.com"
                  value={contact.email}
                  onChange={(event) => setContact((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-foreground">Phone number</span>
                <input
                  className="mt-2 h-10 w-full rounded-md border border-input px-3 text-foreground outline-none focus:border-ring"
                  placeholder="+91 ..."
                  value={contact.phone}
                  onChange={(event) => setContact((current) => ({ ...current, phone: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-foreground">LinkedIn profile</span>
                <input
                  className="mt-2 h-10 w-full rounded-md border border-input px-3 text-foreground outline-none focus:border-ring"
                  placeholder="https://linkedin.com/in/..."
                  value={contact.linkedin}
                  onChange={(event) => setContact((current) => ({ ...current, linkedin: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-foreground">GitHub profile</span>
                <input
                  className="mt-2 h-10 w-full rounded-md border border-input px-3 text-foreground outline-none focus:border-ring"
                  placeholder="https://github.com/..."
                  value={contact.github}
                  onChange={(event) => setContact((current) => ({ ...current, github: event.target.value }))}
                />
              </label>
            </div>
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">Live preview</h2>
            {sampleRow ? (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Subject</p>
                  <p className="mt-1 break-words rounded-md bg-muted p-3 text-sm font-medium text-foreground">{preview.subject}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Body</p>
                  <pre className="mt-1 whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-sm leading-6 text-foreground">
                    {preview.body}
                  </pre>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">Upload a valid CSV first.</p>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">Sending settings</h2>
            <div className="mt-4 grid gap-4">
              <label className="block">
                <span className="text-sm font-medium text-foreground">Daily provider limit</span>
                <input
                  className="mt-2 h-10 w-full rounded-md border border-input px-3 text-foreground outline-none focus:border-ring"
                  type="number"
                  min={1}
                  value={dailyLimit}
                  onChange={(event) => setDailyLimit(Number(event.target.value))}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-foreground">Safety percent</span>
                <input
                  className="mt-2 h-10 w-full rounded-md border border-input px-3 text-foreground outline-none focus:border-ring"
                  type="number"
                  min={1}
                  max={100}
                  value={safetyPercent}
                  onChange={(event) => setSafetyPercent(Number(event.target.value))}
                />
              </label>
              <div className="border-t border-border pt-4">
                <PacingEditor value={pacing} onChange={setPacing} />
              </div>
            </div>
            <p className="mt-4 rounded-md bg-primary/10 p-3 text-sm font-medium text-primary">
              You will send up to {effectiveCap} emails/day, in batches of {pacing.batchSize} with a{" "}
              {pacing.batchCooldownMin} minute pause between batches. You can change the pace later, even while sending.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Anyone already emailed by a previous campaign is skipped automatically, so nobody hears from you twice.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
