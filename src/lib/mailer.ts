import { readFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";

type SendJobEmailInput = {
  to: string;
  subject: string;
  html: string;
  resumePath: string;
};

type ResumeAttachment = {
  filename: string;
  content: Buffer;
};

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD must be set.");
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

async function readRemoteResume(resumePath: string): Promise<ResumeAttachment> {
  const response = await fetch(resumePath);

  if (!response.ok) {
    throw new Error(`Could not download the resume from storage (HTTP ${response.status}).`);
  }

  return {
    filename: path.basename(new URL(resumePath).pathname) || "resume.pdf",
    content: Buffer.from(await response.arrayBuffer()),
  };
}

async function readLocalResume(resumePath: string): Promise<ResumeAttachment> {
  const uploadsRoot = path.join(process.cwd(), "public", "uploads");
  const normalized = resumePath.startsWith("/") ? resumePath.slice(1) : resumePath;
  const absolutePath = path.resolve(process.cwd(), "public", normalized);

  // resumePath reaches us from the campaign record, so keep it inside the uploads
  // directory rather than letting a crafted "../" path attach an arbitrary file.
  if (absolutePath !== uploadsRoot && !absolutePath.startsWith(`${uploadsRoot}${path.sep}`)) {
    throw new Error("Resume path points outside the uploads directory.");
  }

  return {
    filename: path.basename(absolutePath),
    content: await readFile(absolutePath),
  };
}

// Resumes uploaded since the ImageKit switch are absolute URLs. Campaigns created
// before it still hold a /uploads/... path on disk, so both are supported.
async function resolveResume(resumePath: string) {
  return /^https?:\/\//i.test(resumePath) ? readRemoteResume(resumePath) : readLocalResume(resumePath);
}

export async function sendJobEmail({ to, subject, html, resumePath }: SendJobEmailInput) {
  try {
    const senderName = process.env.SENDER_NAME || "Job Applicant";
    const gmailUser = process.env.GMAIL_USER;

    if (!gmailUser) {
      throw new Error("GMAIL_USER must be set.");
    }

    const attachment = await resolveResume(resumePath);

    await getTransporter().sendMail({
      from: `${senderName} <${gmailUser}>`,
      to,
      subject,
      html,
      attachments: [
        {
          filename: attachment.filename,
          content: attachment.content,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown mailer error";
    throw new Error(`Email send failed: ${message}`);
  }
}
