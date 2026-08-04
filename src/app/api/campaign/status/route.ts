import { RecipientStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiErrors";
import { getEffectiveCap, getTodayKey, isCampaignRunning } from "@/lib/sender";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaignId")?.trim();

    if (!campaignId) {
      return NextResponse.json({ error: "campaignId is required." }, { status: 400 });
    }

    await prisma.recipient.updateMany({
      where: {
        campaignId,
        status: RecipientStatus.SENT,
        emailSent: false,
      },
      data: { emailSent: true },
    });

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        recipients: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    const today = getTodayKey();
    const todayLog = await prisma.dailySendLog.findUnique({
      where: {
        campaignId_date: {
          campaignId,
          date: today,
        },
      },
    });

    const sent = campaign.recipients.filter((recipient) => recipient.emailSent || recipient.status === RecipientStatus.SENT).length;
    const failed = campaign.recipients.filter((recipient) => recipient.status === RecipientStatus.FAILED).length;
    const pending = campaign.recipients.filter((recipient) => !recipient.emailSent && recipient.status === RecipientStatus.PENDING).length;
    const effectiveCap = getEffectiveCap(campaign.dailyLimit, campaign.safetyPercent);
    const countSent = todayLog?.countSent ?? 0;
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
        status: campaign.status,
      },
      counts: {
        total: campaign.recipients.length,
        sent,
        failed,
        pending,
      },
      today: {
        date: today,
        countSent,
        effectiveCap,
        remainingToday: Math.max(0, effectiveCap - countSent),
      },
      recipients: campaign.recipients.map((recipient) => ({
        id: recipient.id,
        name: recipient.name,
        companyName: recipient.companyName,
        hrEmail: recipient.hrEmail,
        hrName: recipient.hrName,
        emailSent: recipient.emailSent || recipient.status === RecipientStatus.SENT,
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
