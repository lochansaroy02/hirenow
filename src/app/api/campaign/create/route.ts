import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiErrors";
import { prisma } from "@/lib/prisma";
import { EMAIL_REGEX } from "@/lib/csv";
import { DEFAULT_PACING, validatePacing } from "@/lib/pacing";
import type { CsvRecipientRow } from "@/types/campaign";
import { requireUser } from "@/lib/auth";
import { getGmailCredentials } from "@/lib/gmailAccount";

export const runtime = "nodejs";

type CreateCampaignBody = {
  name?: string;
  subject?: string;
  body?: string;
  resumePath?: string;
  dailyLimit?: number;
  safetyPercent?: number;
  delayMinSec?: number;
  delayMaxSec?: number;
  batchSize?: number;
  batchCooldownMin?: number;
  recipients?: CsvRecipientRow[];
  contactIds?: string[];
};

const MAX_RECIPIENTS = 10_000;

function isValidRecipient(row: unknown): row is CsvRecipientRow {
  if (!row || typeof row !== "object") {
    return false;
  }

  const candidate = row as Partial<CsvRecipientRow>;
  return Boolean(
    candidate.name &&
      candidate.company_name &&
      candidate.hr_name &&
      typeof candidate.hr_email === "string" &&
      EMAIL_REGEX.test(candidate.hr_email.trim()),
  );
}

/** One row per address (case-insensitive); the last occurrence wins, as on import. */
function dedupeByEmail(rows: CsvRecipientRow[]) {
  const byEmail = new Map<string, CsvRecipientRow>();

  for (const row of rows) {
    const hrEmail = row.hr_email.trim().toLowerCase();
    byEmail.set(hrEmail, { ...row, hr_email: hrEmail });
  }

  return Array.from(byEmail.values());
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    if (!(await getGmailCredentials(user.id))) {
      return NextResponse.json(
        { error: "Connect your Gmail account in Settings first. Campaigns send from your own Gmail." },
        { status: 400 },
      );
    }

    const body = await request.json() as CreateCampaignBody;
    const campaignName = body.name?.trim() || "Untitled Campaign";
    const subject = body.subject?.trim();
    const emailBody = body.body?.trim();
    const resumePath = body.resumePath?.trim();
    const dailyLimit = Number(body.dailyLimit ?? 500);
    const safetyPercent = Number(body.safetyPercent ?? 80);
    const delayMinSec = Number(body.delayMinSec ?? DEFAULT_PACING.delayMinSec);
    const delayMaxSec = Number(body.delayMaxSec ?? DEFAULT_PACING.delayMaxSec);
    const batchSize = Number(body.batchSize ?? DEFAULT_PACING.batchSize);
    const batchCooldownMin = Number(body.batchCooldownMin ?? DEFAULT_PACING.batchCooldownMin);
    let recipients: unknown[] = Array.isArray(body.recipients) ? body.recipients : [];

    if (!subject || !emailBody || !resumePath) {
      return NextResponse.json({ error: "Subject, body, and resume are required." }, { status: 400 });
    }

    // Recipients must be named explicitly. An empty request used to fall back to
    // every saved contact, which could email the whole address book by accident.
    if (recipients.length === 0 && Array.isArray(body.contactIds) && body.contactIds.length > 0) {
      const contacts = await prisma.contact.findMany({
        where: { id: { in: body.contactIds } },
        orderBy: { createdAt: "asc" },
      });

      recipients = contacts.map((contact) => ({
        name: contact.name,
        company_name: contact.companyName,
        hr_email: contact.hrEmail,
        hr_name: contact.hrName,
      }));
    }

    if (recipients.length === 0) {
      return NextResponse.json({ error: "At least one saved contact or valid recipient is required." }, { status: 400 });
    }

    const invalid = recipients.filter((row) => !isValidRecipient(row)).length;

    if (invalid > 0) {
      return NextResponse.json(
        { error: `${invalid} recipient${invalid === 1 ? " is" : "s are"} missing a field or has an invalid email address.` },
        { status: 400 },
      );
    }

    const uniqueRecipients = dedupeByEmail(recipients as CsvRecipientRow[]);

    if (uniqueRecipients.length > MAX_RECIPIENTS) {
      return NextResponse.json(
        { error: `A campaign can have at most ${MAX_RECIPIENTS.toLocaleString()} recipients.` },
        { status: 400 },
      );
    }

    if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 2000) {
      return NextResponse.json({ error: "Daily limit must be an integer between 1 and 2000." }, { status: 400 });
    }

    if (!Number.isInteger(safetyPercent) || safetyPercent < 1 || safetyPercent > 100) {
      return NextResponse.json({ error: "Safety percent must be an integer between 1 and 100." }, { status: 400 });
    }

    const invalidPacing = validatePacing({ delayMinSec, delayMaxSec, batchSize, batchCooldownMin });

    if (invalidPacing) {
      return NextResponse.json({ error: invalidPacing }, { status: 400 });
    }

    const campaign = await prisma.$transaction(async (tx) => {
      const created = await tx.campaign.create({
        data: {
          userId: user.id,
          name: campaignName,
          subject,
          body: emailBody,
          resumePath,
          dailyLimit,
          safetyPercent,
          delayMinSec,
          delayMaxSec,
          batchSize,
          batchCooldownMin,
          status: "DRAFT",
        },
      });

      await tx.recipient.createMany({
        data: uniqueRecipients.map((recipient) => ({
          campaignId: created.id,
          name: recipient.name,
          companyName: recipient.company_name,
          hrEmail: recipient.hr_email,
          hrName: recipient.hr_name,
        })),
      });

      return created;
    });

    // Not blocking: the sender skips these anyway. Reported so the user knows how
    // many of the list will actually be emailed.
    const alreadyContacted = await prisma.sentEmail.count({
      where: { hrEmail: { in: uniqueRecipients.map((recipient) => recipient.hr_email) } },
    });

    return NextResponse.json({
      campaignId: campaign.id,
      recipientCount: uniqueRecipients.length,
      duplicatesRemoved: recipients.length - uniqueRecipients.length,
      alreadyContacted,
    });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Campaign creation failed." });
  }
}
