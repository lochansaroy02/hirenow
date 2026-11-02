"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PurgeScope = "contacts" | "queued" | "mails" | "all";

type DangerZoneProps = {
  mailCount: number;
  campaignCount: number;
  sentCount: number;
  isSending: boolean;
  onDeleted: () => void;
};

type ScopeCopy = {
  scope: PurgeScope;
  button: string;
  title: string;
  blurb: string;
};

const SCOPES: ScopeCopy[] = [
  {
    scope: "contacts",
    button: "Delete saved contacts",
    title: "Delete every saved contact?",
    blurb: "Clears the contact book you import spreadsheets into. Campaigns and their mail history stay exactly as they are.",
  },
  {
    scope: "queued",
    button: "Delete queued mail",
    title: "Delete every mail that has not been sent?",
    blurb: "Clears the sending queue. Mails that already went out are kept, so duplicate protection keeps working and nobody gets a second email.",
  },
  {
    scope: "mails",
    button: "Delete mail history",
    title: "Delete every campaign and mail record?",
    blurb: "Removes all campaigns, every mail row, and the daily send counters. Your saved contacts stay.",
  },
  {
    scope: "all",
    button: "Delete everything",
    title: "Delete all contacts and all mail history?",
    blurb: "Empties the database completely: contacts, campaigns, mail records, and send counters.",
  },
];

const CONFIRMATION = "DELETE";

export function DangerZone({ mailCount, campaignCount, sentCount, isSending, onDeleted }: DangerZoneProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [active, setActive] = useState<ScopeCopy | null>(null);
  const [typed, setTyped] = useState("");
  const [contactCount, setContactCount] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  // Deletion is admin-only on the server; hide the controls from everyone else.
  const [isAdmin, setIsAdmin] = useState(false);

  const loadContactCount = useCallback(() => {
    void fetch("/api/contacts")
      .then((response) => response.json())
      .then((payload: { contacts?: unknown[] }) => setContactCount(payload.contacts?.length ?? 0))
      .catch(() => setContactCount(null));
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(loadContactCount, 0);
    return () => window.clearTimeout(timeout);
  }, [loadContactCount]);

  useEffect(() => {
    void fetch("/api/auth/me")
      .then((response) => response.json())
      .then((payload: { user?: { role?: string } | null }) => setIsAdmin(payload.user?.role === "ADMIN"))
      .catch(() => setIsAdmin(false));
  }, []);

  const close = useCallback(() => {
    setActive(null);
    setTyped("");
    setError("");
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (active && !dialog.open) {
      dialog.showModal();
    } else if (!active && dialog.open) {
      dialog.close();
    }
  }, [active]);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    dialog.addEventListener("close", close);
    return () => dialog.removeEventListener("close", close);
  }, [close]);

  const losesDuplicateProtection =
    active !== null && (active.scope === "mails" || active.scope === "all") && sentCount > 0;

  async function runDelete() {
    if (!active || typed !== CONFIRMATION) {
      return;
    }

    setIsDeleting(true);
    setError("");

    try {
      const response = await fetch("/api/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: active.scope, confirm: typed }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Delete failed.");
      }

      const { contacts, campaigns, mails, sentRecords } = payload.deleted;
      setResult(
        `Deleted ${contacts} contacts, ${campaigns} campaigns, ${mails} mail records` +
          (sentRecords ? `, and ${sentRecords} send records.` : "."),
      );
      close();
      loadContactCount();
      onDeleted();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete failed.");
    } finally {
      setIsDeleting(false);
    }
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <section className="mt-6 rounded-lg border border-red-200 bg-card shadow-sm">
      <div className="border-b border-red-200 bg-red-50 px-5 py-4">
        <h2 className="text-lg font-semibold text-red-900">Danger zone</h2>
        <p className="mt-1 text-sm text-red-800">Permanent deletion. There is no undo and no backup.</p>
      </div>

      <div className="space-y-4 p-5">
        {result ? <p className="rounded-md bg-muted p-3 text-sm text-foreground">{result}</p> : null}

        {sentCount > 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <span className="font-semibold">Deleting mail history turns off duplicate protection.</span> HireNow knows not
            to email someone twice because it can see the {sentCount} mails it already sent. Delete those records and
            every one of those recruiters becomes eligible to be emailed again.
          </p>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {SCOPES.map((entry) => (
            <button
              key={entry.scope}
              type="button"
              className="h-10 rounded-md border border-red-300 px-4 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                setResult("");
                setActive(entry);
              }}
              disabled={isSending && entry.scope !== "contacts"}
            >
              {entry.button}
            </button>
          ))}
        </div>

        {isSending ? (
          <p className="text-sm text-muted-foreground">
            A campaign is sending right now. Pause it before deleting mail history.
          </p>
        ) : null}
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="danger-title"
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border bg-card p-0 text-foreground backdrop:bg-foreground/50"
        onClick={(event) => {
          if (event.target === dialogRef.current) {
            dialogRef.current?.close();
          }
        }}
      >
        {active ? (
          <div className="p-6">
            <h3 id="danger-title" className="text-xl font-semibold text-foreground">
              {active.title}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">{active.blurb}</p>

            <ul className="mt-4 space-y-1 rounded-md bg-muted p-3 text-sm text-foreground">
              {active.scope === "contacts" || active.scope === "all" ? (
                <li>
                  <span className="font-semibold">{contactCount ?? "..."}</span> saved contacts
                </li>
              ) : null}
              {active.scope === "queued" ? (
                <>
                  <li>
                    <span className="font-semibold">{mailCount - sentCount}</span> queued mails removed
                  </li>
                  <li>
                    <span className="font-semibold">{sentCount}</span> already-sent mails kept
                  </li>
                </>
              ) : null}
              {active.scope === "mails" || active.scope === "all" ? (
                <>
                  <li>
                    <span className="font-semibold">{campaignCount}</span> campaigns
                  </li>
                  <li>
                    <span className="font-semibold">{mailCount}</span> mail records, including{" "}
                    <span className="font-semibold">{sentCount}</span> already sent
                  </li>
                </>
              ) : null}
            </ul>

            {losesDuplicateProtection ? (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Those {sentCount} send records are the only reason HireNow skips people it already contacted. After this,
                they can be emailed a second time.
              </p>
            ) : null}

            {error ? <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

            <label className="mt-4 block">
              <span className="text-sm font-medium text-foreground">Type {CONFIRMATION} to confirm</span>
              <input
                className="mt-2 h-10 w-full rounded-md border border-input px-3 font-mono text-foreground outline-none focus:border-red-500"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
              />
            </label>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="h-10 rounded-md border border-input px-4 text-sm font-semibold text-foreground hover:bg-muted"
                onClick={() => dialogRef.current?.close()}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-10 rounded-md bg-red-700 px-4 text-sm font-semibold text-primary-foreground hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void runDelete()}
                disabled={typed !== CONFIRMATION || isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete permanently"}
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}
