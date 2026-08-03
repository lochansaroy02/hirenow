import path from "node:path";
import nodemailer from "nodemailer";

type SendJobEmailInput = {
  to: string;
  subject: string;
  html: string;
  resumePath: string;
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

export async function sendJobEmail({ to, subject, html, resumePath }: SendJobEmailInput) {
  try {
    const senderName = process.env.SENDER_NAME || "Job Applicant";
    const gmailUser = process.env.GMAIL_USER;

    if (!gmailUser) {
      throw new Error("GMAIL_USER must be set.");
    }

    const normalizedResumePath = resumePath.startsWith("/") ? resumePath.slice(1) : resumePath;
    const attachmentPath = path.join(process.cwd(), "public", normalizedResumePath);

    await getTransporter().sendMail({
      from: `${senderName} <${gmailUser}>`,
      to,
      subject,
      html,
      attachments: [
        {
          filename: path.basename(attachmentPath),
          path: attachmentPath,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown mailer error";
    throw new Error(`Email send failed: ${message}`);
  }
}
