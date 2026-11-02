import { readFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";

type SendInput = {
  to: string;
  subject: string;
  html: string;
};

/** One user's Gmail login. Comes from their account settings, never from .env. */
export type GmailCredentials = {
  user: string;
  pass: string;
  senderName: string;
};

type ResumeAttachment = {
  filename: string;
  content: Buffer;
};

/** Where local (non-ImageKit) resumes live. Outside public/, so never served. */
export const LOCAL_RESUME_ROOT = path.join(process.cwd(), "storage");

// Older uploads were written under public/. Still read from there so existing
// campaigns keep working, but new files never go there.
const LEGACY_RESUME_ROOT = path.join(process.cwd(), "public");

/**
 * A send failure, tagged with whether trying again later could succeed. Timeouts,
 * dropped connections and 4xx SMTP replies are transient; 5xx replies (bad address,
 * rejected message) are not. An account problem (login rejected, Gmail's own daily
 * limit hit) is about the sender, not the recipient, so it stops the whole run.
 */
export class SendError extends Error {
  transient: boolean;
  account: boolean;

  constructor(message: string, transient: boolean, account = false) {
    super(message);
    this.transient = transient;
    this.account = account;
  }
}

const TRANSIENT_CODES = new Set(["ETIMEDOUT", "ECONNECTION", "ECONNRESET", "ESOCKET", "EDNS", "ETLS", "ECONNREFUSED"]);

function classify(error: unknown): SendError {
  const message = error instanceof Error ? error.message : "Unknown mailer error";
  const details = error as { responseCode?: number; code?: string } | null;
  const responseCode = details?.responseCode;

  if (details?.code === "EAUTH" || responseCode === 534 || responseCode === 535) {
    return new SendError(
      "Gmail rejected the login. The App Password may have been revoked; update it in Settings, then resume.",
      false,
      true,
    );
  }

  // 550 5.4.5: Gmail's own daily sending limit for this account.
  if (/5\.4\.5|daily user sending limit/i.test(message)) {
    return new SendError("Gmail's daily sending limit for this account was reached. Resume tomorrow.", false, true);
  }

  const transient =
    (typeof responseCode === "number" && responseCode >= 400 && responseCode < 500) ||
    (typeof details?.code === "string" && TRANSIENT_CODES.has(details.code));

  return new SendError(`Email send failed: ${message}`, transient);
}

export function gmailTransport({ user, pass }: GmailCredentials, pool = false) {
  return nodemailer.createTransport({
    service: "gmail",
    ...(pool ? { pool: true, maxConnections: 1 } : {}),
    auth: { user, pass },
  });
}

async function readRemoteResume(resumePath: string): Promise<ResumeAttachment> {
  const response = await fetch(resumePath);

  if (!response.ok) {
    // A storage outage may clear up, so this is worth retrying.
    throw new SendError(`Could not download the resume from storage (HTTP ${response.status}).`, true);
  }

  return {
    filename: path.basename(new URL(resumePath).pathname) || "resume.pdf",
    content: Buffer.from(await response.arrayBuffer()),
  };
}

function resolveInside(root: string, relative: string) {
  const uploadsRoot = path.join(root, "uploads");
  const absolutePath = path.resolve(root, relative);

  // resumePath reaches us from the campaign record, so keep it inside the uploads
  // directory rather than letting a crafted "../" path attach an arbitrary file.
  if (!absolutePath.startsWith(`${uploadsRoot}${path.sep}`)) {
    throw new SendError("Resume path points outside the uploads directory.", false);
  }

  return absolutePath;
}

async function readLocalResume(resumePath: string): Promise<ResumeAttachment> {
  const relative = resumePath.startsWith("/") ? resumePath.slice(1) : resumePath;

  for (const root of [LOCAL_RESUME_ROOT, LEGACY_RESUME_ROOT]) {
    const absolutePath = resolveInside(root, relative);

    try {
      return { filename: path.basename(absolutePath), content: await readFile(absolutePath) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  throw new SendError(`Resume file not found: ${resumePath}`, false);
}

// Resumes uploaded since the ImageKit switch are absolute URLs. Campaigns created
// before it still hold a /uploads/... path on disk, so both are supported.
async function resolveResume(resumePath: string) {
  return /^https?:\/\//i.test(resumePath) ? readRemoteResume(resumePath) : readLocalResume(resumePath);
}

/**
 * One sending session for a campaign run, from one user's Gmail account: a single
 * pooled SMTP connection, and the resume downloaded once rather than once per email.
 * Call close() when done.
 */
export function createMailSession(credentials: GmailCredentials, resumePath: string, attachmentFilename?: string) {
  let transporter: nodemailer.Transporter | null = null;
  let attachment: Promise<ResumeAttachment> | null = null;

  function getTransporter() {
    if (!transporter) {
      transporter = gmailTransport(credentials, true);
    }

    return transporter;
  }

  function getAttachment() {
    if (!attachment) {
      attachment = resolveResume(resumePath);
      // Let a failed download be retried on the next send instead of caching the error.
      attachment.catch(() => {
        attachment = null;
      });
    }

    return attachment;
  }

  return {
    async send({ to, subject, html }: SendInput) {
      try {
        const resume = await getAttachment();

        await getTransporter().sendMail({
          from: { name: credentials.senderName, address: credentials.user },
          to,
          subject,
          html,
          attachments: [
            {
              filename: attachmentFilename || resume.filename,
              content: resume.content,
              contentType: "application/pdf",
            },
          ],
        });
      } catch (error) {
        throw error instanceof SendError ? error : classify(error);
      }
    },

    close() {
      transporter?.close();
      transporter = null;
    },
  };
}
