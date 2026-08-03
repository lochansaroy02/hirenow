import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { CsvRecipientRow } from "@/types/campaign";

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
  recipients?: CsvRecipientRow[];
  contactIds?: string[];
};

function isValidRecipient(row: unknown): row is CsvRecipientRow {
  if (!row || typeof row !== "object") {
    return false;
  }

  const candidate = row as Partial<CsvRecipientRow>;
  return Boolean(candidate.name && candidate.company_name && candidate.hr_email && candidate.hr_name);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as CreateCampaignBody;
    const campaignName = body.name?.trim() || "Untitled Campaign";
    const subject = body.subject?.trim();
    const emailBody = body.body?.trim();
    const resumePath = body.resumePath?.trim();
    const dailyLimit = Number(body.dailyLimit ?? 500);
    const safetyPercent = Number(body.safetyPercent ?? 80);
    const delayMinSec = Number(body.delayMinSec ?? 8);
    const delayMaxSec = Number(body.delayMaxSec ?? 20);
    let recipients = body.recipients ?? [];

    if (!subject || !emailBody || !resumePath) {
      return NextResponse.json({ error: "Subject, body, and resume are required." }, { status: 400 });
    }

    if (recipients.length === 0) {
      const contacts = await prisma.contact.findMany({
        where: Array.isArray(body.contactIds) && body.contactIds.length > 0
          ? { id: { in: body.contactIds } }
          : {},
        orderBy: { createdAt: "asc" },
      });

      recipients = contacts.map((contact) => ({
        name: contact.name,
        company_name: contact.companyName,
        hr_email: contact.hrEmail,
        hr_name: contact.hrName,
      }));
    }

    if (!Array.isArray(recipients) || recipients.length === 0 || !recipients.every(isValidRecipient)) {
      return NextResponse.json({ error: "At least one saved contact or valid recipient is required." }, { status: 400 });
    }

    if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 2000) {
      return NextResponse.json({ error: "Daily limit must be an integer between 1 and 2000." }, { status: 400 });
    }

    if (!Number.isInteger(safetyPercent) || safetyPercent < 1 || safetyPercent > 100) {
      return NextResponse.json({ error: "Safety percent must be an integer between 1 and 100." }, { status: 400 });
    }

    if (!Number.isInteger(delayMinSec) || !Number.isInteger(delayMaxSec) || delayMinSec < 0 || delayMaxSec < delayMinSec) {
      return NextResponse.json({ error: "Delay range must be valid whole seconds." }, { status: 400 });
    }

    const campaign = await prisma.$transaction(async (tx) => {
      const created = await tx.campaign.create({
        data: {
          name: campaignName,
          subject,
          body: emailBody,
          resumePath,
          dailyLimit,
          safetyPercent,
          delayMinSec,
          delayMaxSec,
          status: "DRAFT",
        },
      });

      await tx.recipient.createMany({
        data: recipients.map((recipient) => ({
          campaignId: created.id,
          name: recipient.name,
          companyName: recipient.company_name,
          hrEmail: recipient.hr_email,
          hrName: recipient.hr_name,
        })),
      });

      return created;
    });

    return NextResponse.json({ campaignId: campaign.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Campaign creation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
