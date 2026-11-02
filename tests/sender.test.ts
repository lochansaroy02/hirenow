import { RecipientStatus, SendState } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { hasTestDatabase, resetDatabase } from "./db";

// No real mail: every send goes through this mock, which the tests steer. "from"
// is the Gmail account the session was opened for.
const send = vi.fn<(input: { to: string; from: string }) => Promise<void>>();

vi.mock("@/lib/mailer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mailer")>();
  return {
    ...actual,
    createMailSession: (credentials: { user: string }) => ({
      send: (input: { to: string }) => send({ ...input, from: credentials.user }),
      close: () => undefined,
    }),
  };
});

const { startCampaignJob, isCampaignRunning, stopCampaignJob, repaceCampaignJob } = await import("@/lib/sender");
const { SendError } = await import("@/lib/mailer");
const { encryptSecret } = await import("@/lib/secrets");

let owner: { id: string };

async function createUser(gmailAddress: string | null) {
  return prisma.user.create({
    data: {
      email: `${Math.random().toString(36).slice(2, 9)}@login.test`,
      name: "Sender",
      passwordHash: "unused",
      gmailAddress,
      gmailAppPasswordEnc: gmailAddress ? encryptSecret("abcdefghijklmnop") : null,
    },
  });
}

async function createCampaign(
  emails: string[],
  overrides: Partial<{ dailyLimit: number; userId: string | null }> = {},
) {
  return prisma.campaign.create({
    data: {
      userId: overrides.userId === undefined ? owner.id : overrides.userId,
      name: `Campaign ${Math.random().toString(36).slice(2, 7)}`,
      subject: "Hi {{hr_name}}",
      body: "Hello",
      resumePath: "https://example.test/resume.pdf",
      dailyLimit: overrides.dailyLimit ?? 500,
      safetyPercent: 100,
      delayMinSec: 0,
      delayMaxSec: 0,
      batchSize: 1000,
      batchCooldownMin: 0,
      recipients: {
        create: emails.map((hrEmail) => ({ name: "Me", companyName: "Acme", hrEmail, hrName: "HR" })),
      },
    },
  });
}

async function waitUntil(condition: () => boolean | Promise<boolean>, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;

  while (!(await condition())) {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for condition");
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function start(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  return startCampaignJob(campaignId, { id: campaign.userId ?? owner.id, role: "USER" });
}

async function runToEnd(...campaignIds: string[]) {
  await Promise.all(campaignIds.map((id) => start(id)));
  await waitUntil(() => campaignIds.every((id) => !isCampaignRunning(id)));
}

describe.skipIf(!hasTestDatabase)("send loop", () => {
  beforeEach(async () => {
    await resetDatabase();
    owner = await createUser("me@gmail.com");
    send.mockReset();
    send.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 15)));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("emails an address once when two campaigns reach it at the same time", async () => {
    const a = await createCampaign(["shared@x.com", "a-only@x.com"]);
    const b = await createCampaign(["Shared@X.com", "b-only@x.com"]);

    await runToEnd(a.id, b.id);

    const sentTo = send.mock.calls.map(([input]) => input.to.toLowerCase());
    expect(sentTo.filter((to) => to === "shared@x.com")).toHaveLength(1);
    expect(sentTo).toHaveLength(3);

    const skipped = await prisma.recipient.findMany({ where: { status: RecipientStatus.SKIPPED } });
    expect(skipped).toHaveLength(1);
    expect(await prisma.sentEmail.count({ where: { state: SendState.SENT } })).toBe(3);
  });

  it("never re-sends an address whose send was reserved but not confirmed", async () => {
    // The state a crash between "sent" and "recorded" leaves behind.
    await prisma.sentEmail.create({
      data: { hrEmail: "crashed@x.com", senderEmail: "me@gmail.com", state: SendState.SENDING },
    });
    const campaign = await createCampaign(["crashed@x.com"]);

    await runToEnd(campaign.id);

    expect(send).not.toHaveBeenCalled();
    const recipient = await prisma.recipient.findFirstOrThrow({ where: { campaignId: campaign.id } });
    expect(recipient.status).toBe(RecipientStatus.SKIPPED);
  });

  it("keeps the address blocked when the mail went out but recording it failed", async () => {
    const campaign = await createCampaign(["unrecorded@x.com"]);

    // Deleting the row mid-send makes the confirm transaction fail after a real send.
    send.mockImplementation(async () => {
      await prisma.recipient.deleteMany({ where: { campaignId: campaign.id } });
    });

    await runToEnd(campaign.id);

    expect(send).toHaveBeenCalledTimes(1);
    const reservation = await prisma.sentEmail.findUniqueOrThrow({
      where: { senderEmail_hrEmail: { senderEmail: "me@gmail.com", hrEmail: "unrecorded@x.com" } },
    });
    expect(reservation.state).toBe(SendState.SENDING);

    send.mockReset();
    const again = await createCampaign(["unrecorded@x.com"]);
    await runToEnd(again.id);
    expect(send).not.toHaveBeenCalled();
  });

  it("enforces the daily cap across every campaign on the account", async () => {
    const a = await createCampaign(["a1@x.com", "a2@x.com", "a3@x.com", "a4@x.com"], { dailyLimit: 5 });
    const b = await createCampaign(["b1@x.com", "b2@x.com", "b3@x.com", "b4@x.com"], { dailyLimit: 5 });

    await runToEnd(a.id, b.id);

    expect(send).toHaveBeenCalledTimes(5);
    const log = await prisma.senderDailyLog.findFirstOrThrow();
    expect(log.countSent).toBe(5);
  });

  it("does not let deleting mail history reset today's count", async () => {
    const first = await createCampaign(["c1@x.com", "c2@x.com"], { dailyLimit: 2 });
    await runToEnd(first.id);
    await prisma.campaign.deleteMany({});

    const second = await createCampaign(["c3@x.com"], { dailyLimit: 2 });
    const result = await start(second.id);

    expect(result.started).toBe(false);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("schedules a retry for a transient failure and releases the address", async () => {
    const campaign = await createCampaign(["flaky@x.com"]);
    send.mockRejectedValue(new SendError("Email send failed: timeout", true));

    await start(campaign.id);
    await waitUntil(async () => {
      const row = await prisma.recipient.findFirst({ where: { campaignId: campaign.id } });
      return Boolean(row?.nextAttemptAt);
    });

    // The loop is now waiting out the backoff; pause it.
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "PAUSED" } });
    stopCampaignJob(campaign.id);
    await waitUntil(() => !isCampaignRunning(campaign.id));

    const row = await prisma.recipient.findFirstOrThrow({ where: { campaignId: campaign.id } });
    expect(row.status).toBe(RecipientStatus.PENDING);
    expect(row.attempts).toBe(1);
    expect(await prisma.sentEmail.count()).toBe(0);
    expect((await prisma.senderDailyLog.findFirstOrThrow()).countSent).toBe(0);
  });

  it("fails a permanent error at once without retrying", async () => {
    const campaign = await createCampaign(["bad@x.com"]);
    send.mockRejectedValue(new SendError("Email send failed: 550 no such user", false));

    await runToEnd(campaign.id);

    const row = await prisma.recipient.findFirstOrThrow({ where: { campaignId: campaign.id } });
    expect(row.status).toBe(RecipientStatus.FAILED);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await prisma.sentEmail.count()).toBe(0);
  });

  it("wakes a sleeping loop immediately on pause", async () => {
    const campaign = await createCampaign(["p1@x.com", "p2@x.com"]);
    await prisma.campaign.update({ where: { id: campaign.id }, data: { delayMinSec: 60, delayMaxSec: 60 } });

    await start(campaign.id);
    await waitUntil(() => send.mock.calls.length === 1);

    const pausedAt = Date.now();
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "PAUSED" } });
    stopCampaignJob(campaign.id);
    await waitUntil(() => !isCampaignRunning(campaign.id), 3000);

    expect(Date.now() - pausedAt).toBeLessThan(3000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("re-times the wait in progress when the pace is shortened mid-send", async () => {
    const campaign = await createCampaign(["r1@x.com", "r2@x.com"]);
    await prisma.campaign.update({ where: { id: campaign.id }, data: { delayMinSec: 600, delayMaxSec: 600 } });

    await start(campaign.id);
    await waitUntil(() => send.mock.calls.length === 1);

    // Was going to wait ten minutes; now the range is zero, so the next send is immediate.
    await prisma.campaign.update({ where: { id: campaign.id }, data: { delayMinSec: 0, delayMaxSec: 0 } });
    repaceCampaignJob(campaign.id);

    await waitUntil(() => send.mock.calls.length === 2, 3000);
    await waitUntil(() => !isCampaignRunning(campaign.id));
  });

  it("lets different Gmail accounts each reach the same recruiter once", async () => {
    const other = await createUser("someone-else@gmail.com");
    const mine = await createCampaign(["hr@x.com"]);
    const theirs = await createCampaign(["hr@x.com"], { userId: other.id });

    await runToEnd(mine.id, theirs.id);

    expect(send.mock.calls.map(([input]) => input.from).sort()).toEqual(["me@gmail.com", "someone-else@gmail.com"]);
  });

  it("treats history from before per-user Gmail as blocking every account", async () => {
    await prisma.sentEmail.create({ data: { hrEmail: "old@x.com", senderEmail: "" } });
    const campaign = await createCampaign(["old@x.com"]);

    await runToEnd(campaign.id);

    expect(send).not.toHaveBeenCalled();
  });

  it("counts the daily cap separately for each Gmail account", async () => {
    const other = await createUser("someone-else@gmail.com");
    const mine = await createCampaign(["m1@x.com", "m2@x.com", "m3@x.com"], { dailyLimit: 2 });
    const theirs = await createCampaign(["t1@x.com", "t2@x.com", "t3@x.com"], { dailyLimit: 2, userId: other.id });

    await runToEnd(mine.id, theirs.id);

    const from = send.mock.calls.map(([input]) => input.from);
    expect(from.filter((sender) => sender === "me@gmail.com")).toHaveLength(2);
    expect(from.filter((sender) => sender === "someone-else@gmail.com")).toHaveLength(2);
  });

  it("pauses with a reason, keeping recipients queued, when Gmail rejects the login", async () => {
    const campaign = await createCampaign(["a@x.com", "b@x.com", "c@x.com"]);
    send.mockRejectedValue(new SendError("Gmail rejected the login.", false, true));

    await runToEnd(campaign.id);

    expect(send).toHaveBeenCalledTimes(1);
    const after = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(after.status).toBe("PAUSED");
    expect(after.pausedReason).toMatch(/rejected the login/);
    const rows = await prisma.recipient.findMany({ where: { campaignId: campaign.id } });
    expect(rows.every((row) => row.status === RecipientStatus.PENDING && row.attempts === 0)).toBe(true);
    expect(await prisma.sentEmail.count()).toBe(0);
  });

  it("refuses to start without a connected Gmail account", async () => {
    const noGmail = await createUser(null);
    const campaign = await createCampaign(["a@x.com"], { userId: noGmail.id });

    const result = await startCampaignJob(campaign.id, { id: noGmail.id, role: "USER" });

    expect(result.started).toBe(false);
    expect(result.message).toMatch(/Connect your Gmail/);
  });

  it("refuses to let another user send someone else's campaign", async () => {
    const intruder = await createUser("intruder@gmail.com");
    const campaign = await createCampaign(["a@x.com"]);

    const result = await startCampaignJob(campaign.id, { id: intruder.id, role: "USER" });

    expect(result.started).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("gives an ownerless older campaign to whoever starts it", async () => {
    const campaign = await createCampaign(["a@x.com"], { userId: null });

    await startCampaignJob(campaign.id, { id: owner.id, role: "USER" });
    await waitUntil(() => !isCampaignRunning(campaign.id));

    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).userId).toBe(owner.id);
    expect(send.mock.calls[0]?.[0].from).toBe("me@gmail.com");
  });
});
