import { RecipientStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiErrors";
import { isCampaignRunning } from "@/lib/sender";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

const CONFIRMATION = "DELETE";
const SCOPES = ["contacts", "queued", "mails", "all"] as const;

type Scope = (typeof SCOPES)[number];

type PurgeBody = {
  scope?: string;
  confirm?: string;
};

function isScope(value: unknown): value is Scope {
  return typeof value === "string" && SCOPES.includes(value as Scope);
}

export async function POST(request: Request) {
  try {
    await requireAdmin();

    const body = (await request.json()) as PurgeBody;

    if (!isScope(body.scope)) {
      return NextResponse.json(
        { error: `scope must be one of: ${SCOPES.join(", ")}.` },
        { status: 400 },
      );
    }

    if (body.confirm !== CONFIRMATION) {
      return NextResponse.json(
        { error: `Type ${CONFIRMATION} to confirm. Nothing was deleted.` },
        { status: 400 },
      );
    }

    const scope = body.scope;
    const removesMail = scope === "mails" || scope === "all";
    const removesQueued = scope === "queued";

    // Deleting campaigns out from under a live send loop would leave it querying
    // rows that no longer exist, so make the caller pause first.
    if (removesMail || removesQueued) {
      const campaigns = await prisma.campaign.findMany({ select: { id: true } });
      const sending = campaigns.filter((campaign) => isCampaignRunning(campaign.id));

      if (sending.length > 0) {
        return NextResponse.json(
          {
            error: "A campaign is still sending. Pause it before deleting mail records. Nothing was deleted.",
          },
          { status: 409 },
        );
      }
    }

    // One transaction, so a failure part-way through leaves nothing half-deleted.
    // SenderDailyLog is never touched: deleting history must not reset today's
    // Gmail send count and let the account go over its daily limit.
    const deleted = await prisma.$transaction(async (tx) => {
      const counts = { contacts: 0, campaigns: 0, mails: 0, sentRecords: 0 };

      if (removesQueued) {
        // Everything that never actually went out. SENT rows are deliberately kept:
        // they are the record that powers cross-campaign duplicate protection.
        counts.mails = (
          await tx.recipient.deleteMany({
            where: { status: { not: RecipientStatus.SENT }, emailSent: false },
          })
        ).count;

        // A campaign with nothing left to send is finished. Left ACTIVE, it would
        // keep the dashboard polling for a send that can never happen.
        await tx.campaign.updateMany({
          where: { status: { not: "COMPLETED" }, recipients: { none: {} } },
          data: { status: "COMPLETED" },
        });
      }

      if (removesMail) {
        // Recipients and daily send logs are removed by the cascade on Campaign,
        // so count them before the delete rather than after.
        counts.mails = await tx.recipient.count();
        counts.campaigns = (await tx.campaign.deleteMany({})).count;
        // SentEmail has no foreign key to Campaign precisely so it survives campaign
        // deletion. Clearing all mail history is the one action that must also drop
        // it, and that is what removes duplicate protection.
        counts.sentRecords = (await tx.sentEmail.deleteMany({})).count;
      }

      if (scope === "contacts" || scope === "all") {
        counts.contacts = (await tx.contact.deleteMany({})).count;
      }

      return counts;
    });

    return NextResponse.json({
      deleted,
      duplicateProtectionCleared: removesMail && deleted.sentRecords > 0,
    });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Delete failed. Nothing may have been removed." });
  }
}
