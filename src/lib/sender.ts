import { Prisma, RecipientStatus, SendState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createMailSession, SendError } from "@/lib/mailer";
import { getGmailCredentials } from "@/lib/gmailAccount";
import { mergePlaceholders, textToHtml } from "@/lib/placeholders";

type CampaignRuntime = {
  batchNumber: number;
  doneInBatch: number;
  cooldownUntil: number | null;
  // Aborted on pause, so a sleeping loop wakes and exits at once instead of
  // finishing its delay or cooldown first.
  abort: AbortController;
  // Aborted (and replaced) when the pace changes, so the wait in progress is
  // re-timed with the new delay instead of finishing the old one.
  repace: AbortController;
  done: Promise<void>;
};

export const MAX_ATTEMPTS = 3;
const COOLDOWN_POLL_MS = 5000;
const RETRY_BACKOFF_MS = 5 * 60_000;
const STOP_WAIT_MS = 30_000;

// Kept on globalThis so a dev hot reload reuses the same map instead of losing
// track of loops that are still running in the old module instance.
const globalForSender = globalThis as unknown as { hirenowRuntimes?: Map<string, CampaignRuntime> };
const runtimes = (globalForSender.hirenowRuntimes ??= new Map<string, CampaignRuntime>());

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
  return runtimes.has(campaignId);
}

export function getCampaignRuntime(campaignId: string) {
  const runtime = runtimes.get(campaignId);

  if (!runtime) {
    return null;
  }

  return {
    batchNumber: runtime.batchNumber,
    doneInBatch: runtime.doneInBatch,
    cooldownUntil: runtime.cooldownUntil ? new Date(runtime.cooldownUntil).toISOString() : null,
  };
}

/** Sends made today from one Gmail account, across every campaign. */
export async function getAccountSentToday(sender: string) {
  const log = await prisma.senderDailyLog.findUnique({
    where: { sender_date: { sender: sender.toLowerCase(), date: getTodayKey() } },
  });
  return log?.countSent ?? 0;
}

/** Pauses a campaign on the sender's own initiative, recording why. */
async function pauseWithReason(campaignId: string, reason: string) {
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "PAUSED", pausedReason: reason } });
}

/** Wakes a running loop so it notices the pause immediately. */
export function stopCampaignJob(campaignId: string) {
  runtimes.get(campaignId)?.abort.abort();
}

/** Tells a running loop its delay settings changed. */
export function repaceCampaignJob(campaignId: string) {
  const runtime = runtimes.get(campaignId);

  if (runtime) {
    const previous = runtime.repace;
    runtime.repace = new AbortController();
    previous.abort();
  }
}

/**
 * Waits a random delay after a send. If the pace is changed mid-wait, a new delay
 * is drawn from the new range and measured from the same send, so shortening the
 * pace takes effect at once and lengthening it extends the current wait.
 */
async function waitBetweenSends(campaignId: string, runtime: CampaignRuntime) {
  const sentAt = Date.now();

  while (true) {
    // Take the signal before reading the range. A change saved after this read
    // aborts the signal; one saved before it is already in the values read.
    const repace = runtime.repace.signal;
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { delayMinSec: true, delayMaxSec: true },
    });

    if (!campaign) {
      return;
    }

    const delayMs = randomDelayMs(campaign.delayMinSec, campaign.delayMaxSec);
    await sleep(Math.max(0, sentAt + delayMs - Date.now()), AbortSignal.any([runtime.abort.signal, repace]));

    if (runtime.abort.signal.aborted || !repace.aborted) {
      return;
    }
  }
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const timer = setTimeout(done, ms);

    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }

    signal.addEventListener("abort", done);
  });
}

function randomDelayMs(minSec: number, maxSec: number) {
  const min = Math.max(0, Math.min(minSec, maxSec));
  const max = Math.max(min, maxSec);
  return (Math.floor(Math.random() * (max - min + 1)) + min) * 1000;
}

async function isStillSending(campaignId: string, signal: AbortSignal) {
  if (signal.aborted) {
    return false;
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { status: true },
  });

  return Boolean(campaign) && campaign?.status !== "PAUSED" && campaign?.status !== "COMPLETED";
}

// A batch cooldown can be half an hour, so wait in short slices and give up as soon
// as the campaign is paused. The abort signal covers pauses made through this
// process; the status poll covers anything else that changes the row.
async function waitUnlessStopped(totalMs: number, campaignId: string, signal: AbortSignal) {
  let waited = 0;

  while (waited < totalMs) {
    const slice = Math.min(COOLDOWN_POLL_MS, totalMs - waited);
    await sleep(slice, signal);
    waited += slice;

    if (!(await isStillSending(campaignId, signal))) {
      return false;
    }
  }

  return true;
}

/** Recipients the loop may pick now: pending, under the attempt limit, not in backoff. */
function readyWhere(campaignId: string): Prisma.RecipientWhereInput {
  return {
    campaignId,
    emailSent: false,
    status: RecipientStatus.PENDING,
    attempts: { lt: MAX_ATTEMPTS },
    OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
  };
}

async function markCompletedIfDone(campaignId: string) {
  const pendingCount = await prisma.recipient.count({
    where: {
      campaignId,
      emailSent: false,
      status: RecipientStatus.PENDING,
      attempts: { lt: MAX_ATTEMPTS },
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

// Take exclusive ownership of a recipient by bumping attempts only if nobody else
// has touched the row since we read it. If two send loops are alive at once (a dev
// hot reload can leave the old one running), exactly one of them wins the claim.
async function claimRecipient(recipientId: string, seenAttempts: number) {
  const claim = await prisma.recipient.updateMany({
    where: {
      id: recipientId,
      status: RecipientStatus.PENDING,
      emailSent: false,
      attempts: seenAttempts,
    },
    data: { attempts: { increment: 1 } },
  });

  return claim.count === 1;
}

type Reservation = { id: string } | { earlier: { sentAt: Date; campaignName: string | null } };

/**
 * Reserves the address for this Gmail account before anything is sent. The pair
 * (senderEmail, hrEmail) is unique, so when two campaigns from the same account
 * reach a recruiter at once exactly one insert succeeds; the other sees the
 * conflict and skips. A reservation that is never confirmed (the process died
 * mid-send) stays in place and keeps blocking the address — it is safer to miss one
 * recruiter than to email someone twice.
 */
async function reserveAddress(
  recipient: { hrEmail: string; hrName: string; companyName: string; name: string },
  campaign: { id: string; name: string },
  senderEmail: string,
): Promise<Reservation> {
  const hrEmail = recipient.hrEmail.toLowerCase();

  // History from before per-user Gmail has no sender recorded. It came from the one
  // shared account, so it conservatively blocks every account.
  const legacy = await prisma.sentEmail.findUnique({
    where: { senderEmail_hrEmail: { senderEmail: "", hrEmail } },
    select: { sentAt: true, campaignName: true },
  });

  if (legacy) {
    return { earlier: legacy };
  }

  try {
    const row = await prisma.sentEmail.create({
      data: {
        hrEmail,
        senderEmail,
        state: SendState.SENDING,
        hrName: recipient.hrName,
        companyName: recipient.companyName,
        recipientName: recipient.name,
        campaignId: campaign.id,
        campaignName: campaign.name,
      },
      select: { id: true },
    });

    return { id: row.id };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }

    const earlier = await prisma.sentEmail.findUnique({
      where: { senderEmail_hrEmail: { senderEmail, hrEmail } },
      select: { sentAt: true, campaignName: true },
    });

    return { earlier: earlier ?? { sentAt: new Date(), campaignName: null } };
  }
}

async function releaseAddress(reservationId: string) {
  await prisma.sentEmail.deleteMany({ where: { id: reservationId, state: SendState.SENDING } });
}

/**
 * Takes one send from today's allowance for this Gmail account. The check and the
 * increment are one conditional UPDATE, so two campaigns cannot both take the last slot.
 */
async function reserveQuota(sender: string, date: string, cap: number) {
  // Prisma's upsert is a read-then-write, so two loops creating today's row at once
  // collide on the primary key. ON CONFLICT makes the create atomic.
  await prisma.$executeRaw`
    INSERT INTO "SenderDailyLog" ("sender", "date", "countSent") VALUES (${sender}, ${date}, 0)
    ON CONFLICT ("sender", "date") DO NOTHING
  `;

  const taken = await prisma.$executeRaw`
    UPDATE "SenderDailyLog" SET "countSent" = "countSent" + 1
    WHERE "sender" = ${sender} AND "date" = ${date} AND "countSent" < ${cap}
  `;

  return taken === 1;
}

async function releaseQuota(sender: string, date: string) {
  await prisma.$executeRaw`
    UPDATE "SenderDailyLog" SET "countSent" = GREATEST("countSent" - 1, 0)
    WHERE "sender" = ${sender} AND "date" = ${date}
  `;
}

async function skipAsDuplicate(recipientId: string, earlier: { sentAt: Date; campaignName: string | null }) {
  const when = earlier.sentAt.toISOString().slice(0, 10);
  const where = earlier.campaignName ? ` in campaign "${earlier.campaignName}"` : "";

  await prisma.recipient.update({
    where: { id: recipientId },
    data: {
      status: RecipientStatus.SKIPPED,
      emailSent: false,
      lastError: `Already emailed on ${when}${where}. Not sent again.`,
    },
  });
}

async function runSendLoop(campaignId: string, runtime: CampaignRuntime) {
  const { signal } = runtime.abort;
  let mail: ReturnType<typeof createMailSession> | null = null;

  try {
    // Every campaign sends from its owner's own Gmail account; there is no shared
    // fallback account.
    const owner = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { userId: true } });
    const credentials = owner?.userId ? await getGmailCredentials(owner.userId) : null;

    if (!credentials) {
      await pauseWithReason(campaignId, "The campaign owner has no working Gmail account. Connect one in Settings, then resume.");
      return;
    }

    const sender = credentials.user.toLowerCase();

    while (true) {
      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });

      if (signal.aborted || !campaign || campaign.status === "PAUSED" || campaign.status === "COMPLETED") {
        break;
      }

      const effectiveCap = getEffectiveCap(campaign.dailyLimit, campaign.safetyPercent);

      if ((await getAccountSentToday(sender)) >= effectiveCap) {
        break;
      }

      // Batch boundary: pause for the cooldown, then start counting a new batch.
      if (campaign.batchSize > 0 && runtime.doneInBatch >= campaign.batchSize) {
        const cooldownMs = Math.max(0, campaign.batchCooldownMin) * 60_000;

        if (cooldownMs > 0) {
          runtime.cooldownUntil = Date.now() + cooldownMs;
          const finished = await waitUnlessStopped(cooldownMs, campaignId, signal);
          runtime.cooldownUntil = null;

          if (!finished) {
            break;
          }
        }

        runtime.batchNumber += 1;
        runtime.doneInBatch = 0;
        continue;
      }

      const recipient = await prisma.recipient.findFirst({
        where: readyWhere(campaignId),
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });

      if (!recipient) {
        if (await markCompletedIfDone(campaignId)) {
          break;
        }

        // Everything left is waiting out a retry backoff; sleep until the first one is due.
        const next = await prisma.recipient.findFirst({
          where: { campaignId, status: RecipientStatus.PENDING, attempts: { lt: MAX_ATTEMPTS } },
          orderBy: { nextAttemptAt: "asc" },
          select: { nextAttemptAt: true },
        });
        const waitMs = Math.max(1000, (next?.nextAttemptAt?.getTime() ?? Date.now()) - Date.now());

        if (!(await waitUnlessStopped(waitMs, campaignId, signal))) {
          break;
        }

        continue;
      }

      if (!mail) {
        const saved = await prisma.savedResume.findUnique({
          where: { resumePath: campaign.resumePath },
          select: { attachmentFilename: true },
        });
        mail = createMailSession(credentials, campaign.resumePath, saved?.attachmentFilename);
      }

      if (!(await claimRecipient(recipient.id, recipient.attempts))) {
        continue;
      }

      const reservation = await reserveAddress(recipient, campaign, sender);

      if ("earlier" in reservation) {
        // Costs no send and no quota, so move straight to the next recipient
        // instead of burning a throttle delay on it.
        await skipAsDuplicate(recipient.id, reservation.earlier);
        continue;
      }

      const date = getTodayKey();
      let quotaTaken: boolean;

      try {
        quotaTaken = await reserveQuota(sender, date, effectiveCap);
      } catch (error) {
        // Nothing was sent, so the address must not stay blocked.
        await releaseAddress(reservation.id).catch(() => undefined);
        throw error;
      }

      if (!quotaTaken) {
        // Another campaign took today's last slot. Hand the recipient back untouched.
        await releaseAddress(reservation.id);
        await prisma.recipient.update({ where: { id: recipient.id }, data: { attempts: { decrement: 1 } } });
        break;
      }

      let sent = false;

      try {
        await mail.send({
          to: recipient.hrEmail,
          subject: mergePlaceholders(campaign.subject, recipient),
          html: textToHtml(mergePlaceholders(campaign.body, recipient)),
        });
        sent = true;

        // Record the send, drop the queue row, and count it for this campaign.
        await prisma.$transaction([
          prisma.sentEmail.update({
            where: { id: reservation.id },
            data: { state: SendState.SENT, sentAt: new Date() },
          }),
          prisma.recipient.delete({ where: { id: recipient.id } }),
          prisma.dailySendLog.upsert({
            where: { campaignId_date: { campaignId, date } },
            create: { campaignId, date, countSent: 1 },
            update: { countSent: { increment: 1 } },
          }),
        ]);
      } catch (error) {
        const message = (error instanceof Error ? error.message : "Unknown send error").slice(0, 1000);

        if (sent) {
          // The mail went out but could not be recorded. The SENDING reservation and
          // the quota slot are deliberately kept: the address stays blocked, so a
          // later pass skips it rather than emailing the recruiter a second time.
          console.error(`[hirenow] sent to ${recipient.hrEmail} but could not record it:`, error);
          await prisma.recipient
            .update({
              where: { id: recipient.id },
              data: { status: RecipientStatus.SKIPPED, lastError: `Sent, but not recorded: ${message}` },
            })
            .catch(() => undefined);
        } else {
          await releaseAddress(reservation.id);
          await releaseQuota(sender, date);

          // The account itself is the problem, not this recipient. Put them back
          // untouched and stop, rather than failing every remaining recipient in turn.
          if (error instanceof SendError && error.account) {
            await prisma.recipient.update({ where: { id: recipient.id }, data: { attempts: { decrement: 1 } } });
            await pauseWithReason(campaignId, error.message);
            break;
          }

          const retry = error instanceof SendError && error.transient && recipient.attempts + 1 < MAX_ATTEMPTS;

          await prisma.recipient.update({
            where: { id: recipient.id },
            data: retry
              ? {
                  lastError: `${message} (will retry)`,
                  nextAttemptAt: new Date(Date.now() + RETRY_BACKOFF_MS * (recipient.attempts + 1)),
                }
              : { status: RecipientStatus.FAILED, emailSent: false, lastError: message },
          });
        }
      }

      // Counts attempts, not just successes: a failed send still opened a
      // connection to the mail server, so it belongs to this batch's pacing.
      // (Skipped duplicates never reach here — they touch no mail server.)
      runtime.doneInBatch += 1;

      if (!(await isStillSending(campaignId, signal))) {
        break;
      }

      await waitBetweenSends(campaignId, runtime);
    }
  } catch (error) {
    // Without this the rejection escapes the fire-and-forget call in
    // startCampaignJob and takes the whole Node process down.
    console.error(`[hirenow] send loop for campaign ${campaignId} stopped:`, error);
  } finally {
    mail?.close();

    if (runtimes.get(campaignId) === runtime) {
      runtimes.delete(campaignId);
    }
  }
}

/**
 * Starts or resumes sending. startedBy is the signed-in user: a campaign from before
 * per-user Gmail (no owner) becomes theirs, and only the owner or an admin can start
 * one, because it sends from the owner's Gmail account.
 */
export async function startCampaignJob(campaignId: string, startedBy: { id: string; role: "ADMIN" | "USER" }) {
  const existing = runtimes.get(campaignId);

  if (existing) {
    if (!existing.abort.signal.aborted) {
      return { started: false, message: "Campaign is already sending." };
    }

    // Paused moments ago and still winding down (an SMTP call may be in flight).
    // Wait for it to exit rather than telling the user it is "already sending".
    await Promise.race([existing.done, new Promise((resolve) => setTimeout(resolve, STOP_WAIT_MS))]);

    if (runtimes.has(campaignId)) {
      return { started: false, message: "The previous run is still stopping. Try again in a moment." };
    }
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });

  if (!campaign) {
    return { started: false, message: "Campaign not found." };
  }

  if (campaign.status === "COMPLETED") {
    return { started: false, message: "Campaign is already completed." };
  }

  const ownerId = campaign.userId ?? startedBy.id;

  if (ownerId !== startedBy.id && startedBy.role !== "ADMIN") {
    return { started: false, message: "Only the person who created this campaign can send it, from their Gmail account." };
  }

  const credentials = await getGmailCredentials(ownerId);

  if (!credentials) {
    return {
      started: false,
      message:
        ownerId === startedBy.id
          ? "Connect your Gmail account in Settings before sending."
          : "The campaign owner has not connected a Gmail account.",
    };
  }

  if (!campaign.userId) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { userId: ownerId } });
  }

  const effectiveCap = getEffectiveCap(campaign.dailyLimit, campaign.safetyPercent);

  if ((await getAccountSentToday(credentials.user)) >= effectiveCap) {
    return { started: false, message: "Today's safe limit for this Gmail account is reached, resume tomorrow." };
  }

  const hasPending = await prisma.recipient.count({
    where: {
      campaignId,
      emailSent: false,
      status: RecipientStatus.PENDING,
      attempts: { lt: MAX_ATTEMPTS },
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
    data: { status: "ACTIVE", pausedReason: null },
  });

  const runtime = {
    batchNumber: 1,
    doneInBatch: 0,
    cooldownUntil: null,
    abort: new AbortController(),
    repace: new AbortController(),
  } as CampaignRuntime;
  runtimes.set(campaignId, runtime);
  runtime.done = runSendLoop(campaignId, runtime);

  return {
    started: true,
    message: `Sending from ${credentials.user} in batches of ${campaign.batchSize}, pausing ${campaign.batchCooldownMin} minutes between batches.`,
  };
}
