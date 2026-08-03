import { RecipientStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendJobEmail } from "@/lib/mailer";
import { mergePlaceholders, textToHtml } from "@/lib/placeholders";

const runningJobs = new Map<string, boolean>();

export function getTodayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getEffectiveCap(dailyLimit: number, safetyPercent: number) {
  return Math.floor((dailyLimit * safetyPercent) / 100);
}

export function isCampaignRunning(campaignId: string) {
  return runningJobs.get(campaignId) === true;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelayMs(minSec: number, maxSec: number) {
  const min = Math.max(0, Math.min(minSec, maxSec));
  const max = Math.max(min, maxSec);
  return (Math.floor(Math.random() * (max - min + 1)) + min) * 1000;
}

async function ensureTodayLog(campaignId: string) {
  const date = getTodayKey();
  return prisma.dailySendLog.upsert({
    where: {
      campaignId_date: {
        campaignId,
        date,
      },
    },
    create: {
      campaignId,
      date,
      countSent: 0,
    },
    update: {},
  });
}

async function markCompletedIfDone(campaignId: string) {
  const pendingCount = await prisma.recipient.count({
    where: {
      campaignId,
      emailSent: false,
      status: RecipientStatus.PENDING,
      attempts: { lt: 3 },
    },
  });

  if (pendingCount === 0) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "COMPLETED" },
    });
    return true;
  }

  return false;
}

async function runSendLoop(campaignId: string) {
  try {
    while (true) {
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
      });

      if (!campaign || campaign.status === "PAUSED" || campaign.status === "COMPLETED") {
        break;
      }

      const todayLog = await ensureTodayLog(campaignId);
      const effectiveCap = getEffectiveCap(campaign.dailyLimit, campaign.safetyPercent);
      const remainingToday = effectiveCap - todayLog.countSent;

      if (remainingToday <= 0) {
        break;
      }

      const recipient = await prisma.recipient.findFirst({
        where: {
          campaignId,
          emailSent: false,
          status: RecipientStatus.PENDING,
          attempts: { lt: 3 },
        },
        orderBy: { createdAt: "asc" },
      });

      if (!recipient) {
        await markCompletedIfDone(campaignId);
        break;
      }

      try {
        const subject = mergePlaceholders(campaign.subject, recipient);
        const html = textToHtml(mergePlaceholders(campaign.body, recipient));

        await sendJobEmail({
          to: recipient.hrEmail,
          subject,
          html,
          resumePath: campaign.resumePath,
        });

        await prisma.$transaction([
          prisma.recipient.update({
            where: { id: recipient.id },
            data: {
              status: RecipientStatus.SENT,
              emailSent: true,
              attempts: { increment: 1 },
              lastError: null,
              sentAt: new Date(),
            },
          }),
          prisma.dailySendLog.update({
            where: {
              campaignId_date: {
                campaignId,
                date: todayLog.date,
              },
            },
            data: { countSent: { increment: 1 } },
          }),
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown send error";
        await prisma.recipient.update({
          where: { id: recipient.id },
          data: {
            status: RecipientStatus.FAILED,
            emailSent: false,
            attempts: { increment: 1 },
            lastError: message.slice(0, 1000),
          },
        });
      }

      const refreshedCampaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { status: true },
      });

      if (refreshedCampaign?.status === "PAUSED") {
        break;
      }

      await sleep(randomDelayMs(campaign.delayMinSec, campaign.delayMaxSec));
    }
  } finally {
    runningJobs.delete(campaignId);
  }
}

export async function startCampaignJob(campaignId: string) {
  if (isCampaignRunning(campaignId)) {
    return { started: false, message: "Campaign is already sending." };
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
  });

  if (!campaign) {
    return { started: false, message: "Campaign not found." };
  }

  if (campaign.status === "COMPLETED") {
    return { started: false, message: "Campaign is already completed." };
  }

  const todayLog = await ensureTodayLog(campaignId);
  const effectiveCap = getEffectiveCap(campaign.dailyLimit, campaign.safetyPercent);
  const remainingToday = effectiveCap - todayLog.countSent;

  if (remainingToday <= 0) {
    return {
      started: false,
      message: "Today's safe limit reached, resume tomorrow.",
    };
  }

  const hasPending = await prisma.recipient.count({
    where: {
      campaignId,
      emailSent: false,
      status: RecipientStatus.PENDING,
      attempts: { lt: 3 },
    },
  });

  if (hasPending === 0) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "COMPLETED" },
    });
    return { started: false, message: "No pending recipients left." };
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "ACTIVE" },
  });

  runningJobs.set(campaignId, true);
  void runSendLoop(campaignId);

  return { started: true, message: "Campaign sending started." };
}
