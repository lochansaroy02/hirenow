import { RecipientStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiErrors";
import {
  getAccountSentToday,
  getCampaignRuntime,
  getEffectiveCap,
  getTodayKey,
  isCampaignRunning,
} from "@/lib/sender";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

// This endpoint is polled every few seconds while sending, so it returns a
// window of the queue, not every row. The mail dashboard pages through the rest.
const RECIPIENT_LIMIT = 500;

export async function GET(request: Request) {
  try {
    await requireUser();

    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaignId")?.trim();

    if (!campaignId) {
      return NextResponse.json({ error: "campaignId is required." }, { status: 400 });
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { user: { select: { name: true, gmailAddress: true } } },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    const [grouped, recipients, sent, countSent] = await Promise.all([
      prisma.recipient.groupBy({
        by: ["status"],
        where: { campaignId },
        _count: { _all: true },
      }),
      prisma.recipient.findMany({
        where: { campaignId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: RECIPIENT_LIMIT,
      }),
      // Sent recipients are deleted once their mail goes out, so the count comes
      // from the permanent SentEmail record for this campaign.
      prisma.sentEmail.count({ where: { campaignId } }),
      // Today's count belongs to the Gmail account this campaign sends from.
      campaign.user?.gmailAddress ? getAccountSentToday(campaign.user.gmailAddress) : Promise.resolve(0),
    ]);

    const countFor = (value: RecipientStatus) =>
      grouped.find((group) => group.status === value)?._count._all ?? 0;
    const remaining = grouped.reduce((sum, group) => sum + group._count._all, 0);
    const pending = countFor(RecipientStatus.PENDING);
    const effectiveCap = getEffectiveCap(campaign.dailyLimit, campaign.safetyPercent);
    const isRunning = isCampaignRunning(campaignId);

    return NextResponse.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        subject: campaign.subject,
        resumePath: campaign.resumePath,
        dailyLimit: campaign.dailyLimit,
        safetyPercent: campaign.safetyPercent,
        delayMinSec: campaign.delayMinSec,
        delayMaxSec: campaign.delayMaxSec,
        batchSize: campaign.batchSize,
        batchCooldownMin: campaign.batchCooldownMin,
        status: campaign.status,
        pausedReason: campaign.pausedReason,
      },
      sender: {
        ownerName: campaign.user?.name ?? null,
        gmailAddress: campaign.user?.gmailAddress ?? null,
      },
      counts: {
        // Everyone this campaign targeted: what went out plus what is still queued.
        total: sent + remaining,
        sent,
        failed: countFor(RecipientStatus.FAILED),
        skipped: countFor(RecipientStatus.SKIPPED),
        pending,
      },
      batch: getCampaignRuntime(campaignId),
      today: {
        date: getTodayKey(),
        // Account-wide: Gmail's daily limit covers every campaign together.
        countSent,
        effectiveCap,
        remainingToday: Math.max(0, effectiveCap - countSent),
      },
      recipients: recipients.map((recipient) => ({
        id: recipient.id,
        name: recipient.name,
        companyName: recipient.companyName,
        hrEmail: recipient.hrEmail,
        hrName: recipient.hrName,
        emailSent: false,
        status: recipient.status,
        attempts: recipient.attempts,
        lastError: recipient.lastError,
        sentAt: recipient.sentAt?.toISOString() ?? null,
      })),
      isRunning,
      needsResume: campaign.status === "ACTIVE" && !isRunning && pending > 0,
    });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to load campaign status." });
  }
}
