"use client";

import { useEffect, useRef } from "react";

type InstructionsModalProps = {
  open: boolean;
  onClose: () => void;
};

const COLUMNS: { column: string; meaning: string; alsoAccepted: string }[] = [
  {
    column: "name",
    meaning: "Your name as the applicant. Fills {{name}} in the email.",
    alsoAccepted: "candidate_name, candidate name",
  },
  {
    column: "company_name",
    meaning: "Company you are applying to. Fills {{company_name}}.",
    alsoAccepted: "company, company name",
  },
  {
    column: "hr_email",
    meaning: "Where the email is sent. Must be a valid address.",
    alsoAccepted: "email, hr email, email address",
  },
  {
    column: "hr_name",
    meaning: "Person you are addressing. Fills {{hr_name}}.",
    alsoAccepted: "recruiter, hr name, recruiter name",
  },
];

const LINKS_TO_PREPARE: { label: string; placeholder: string; example: string }[] = [
  { label: "Your email", placeholder: "{{your_email}}", example: "you@example.com" },
  { label: "Your phone", placeholder: "{{your_phone}}", example: "+91 98765 43210" },
  { label: "LinkedIn URL", placeholder: "{{linkedin_url}}", example: "https://linkedin.com/in/you" },
  { label: "GitHub URL", placeholder: "{{github_url}}", example: "https://github.com/you" },
];

function SectionHeading({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
        {step}
      </span>
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
    </div>
  );
}

export function InstructionsModal({ open, onClose }: InstructionsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // The native dialog closes itself on Escape and on form method="dialog", so mirror
  // that back into React state instead of tracking those cases separately.
  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="instructions-title"
      className="m-auto w-[min(56rem,calc(100vw-2rem))] rounded-xl p-0 text-slate-900 backdrop:bg-slate-950/60"
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          dialogRef.current?.close();
        }
      }}
    >
      <div className="max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-5">
          <p className="text-sm font-medium uppercase tracking-wide text-teal-700">Before you start</p>
          <h2 id="instructions-title" className="mt-1 text-2xl font-semibold text-slate-950">
            Get these three things ready
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            HireNow sends one personalized email per HR contact, with your resume attached. Takes about five minutes to set up.
          </p>
          {/* The body scrolls, so name all three steps up front rather than letting
              the sticky footer imply step 1 is the whole guide. */}
          <ol className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-xs font-medium text-slate-600">
            {["Contacts file", "Resume PDF", "Your links"].map((label, index) => (
              <li key={label} className="flex items-center gap-2">
                {index > 0 ? <span aria-hidden="true" className="text-slate-300">→</span> : null}
                <span className="rounded-full bg-slate-100 px-2.5 py-1">
                  {index + 1}. {label}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-7 px-6 py-6">
          <section className="space-y-3">
            <SectionHeading step={1} title="Your contact list (Excel or CSV)" />
            <p className="text-sm text-slate-600">
              Accepted files: <span className="font-medium text-slate-800">.csv, .xlsx, .xls</span>. For Excel, only the
              first sheet is read. The header row is required and is matched case-insensitively.
            </p>

            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Required column</th>
                    <th className="px-3 py-2">What it means</th>
                    <th className="px-3 py-2">Also accepted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {COLUMNS.map((row) => (
                    <tr key={row.column}>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-semibold text-slate-950">
                        {row.column}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{row.meaning}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.alsoAccepted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Example file</p>
              <pre className="mt-1 overflow-x-auto rounded-md bg-slate-950 p-3 text-xs leading-6 text-slate-100">
{`name,company_name,hr_email,hr_name
Lochan Saroy,Example Inc,hr@example.com,Avery
Lochan Saroy,Acme Ltd,talent@acme.com,Priya`}
              </pre>
            </div>

            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>A row missing any field, or with an invalid email, is skipped and listed back to you.</li>
              <li>Repeated email addresses are collapsed to one contact, so re-uploading an updated file is safe.</li>
              <li>Valid rows are saved to the database and reused for every future campaign.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <SectionHeading step={2} title="Your resume (PDF)" />
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li><span className="font-medium text-slate-800">PDF only, 5MB maximum.</span> Other formats are rejected.</li>
              <li>Use a text-based PDF, not a scan — HireNow reads the text to detect your role.</li>
              <li>
                The attachment is renamed from the detected role, so recruiters receive something like{" "}
                <span className="font-mono text-xs text-slate-800">full-stack-developer-resume.pdf</span> rather than your
                original filename.
              </li>
              <li>The same file is attached to every email in the campaign.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <SectionHeading step={3} title="Your links, ready to paste" />
            <p className="text-sm text-slate-600">
              You will be asked for these on the compose screen. Have them open before you start so you are not hunting for
              them mid-campaign.
            </p>
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Have ready</th>
                    <th className="px-3 py-2">Inserted as</th>
                    <th className="px-3 py-2">Example</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {LINKS_TO_PREPARE.map((link) => (
                    <tr key={link.placeholder}>
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">{link.label}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-teal-700">{link.placeholder}</td>
                      <td className="px-3 py-2 text-slate-600">{link.example}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="rounded-md bg-teal-50 p-3 text-sm text-teal-900">
              Each email is personalized per recipient using{" "}
              <span className="font-mono text-xs">{"{{name}}"}</span>,{" "}
              <span className="font-mono text-xs">{"{{hr_name}}"}</span>, and{" "}
              <span className="font-mono text-xs">{"{{company_name}}"}</span>. You can preview a real example before sending.
            </p>
          </section>
        </div>

        <div className="sticky bottom-0 flex flex-col gap-3 border-t border-slate-200 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">You can reopen this from the Setup guide button any time.</p>
          <form method="dialog">
            <button
              type="submit"
              className="h-10 w-full rounded-md bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 sm:w-auto"
            >
              Got it, let&apos;s start
            </button>
          </form>
        </div>
      </div>
    </dialog>
  );
}
