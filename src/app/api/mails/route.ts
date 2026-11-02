import { Prisma, RecipientStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiErrors";
import { isCampaignRunning } from "@/lib/sender";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 5000;

// Recipients are bulk-inserted per campaign, so createdAt ties across thousands of
// rows. Every sort ends on the unique id to keep paging stable between requests.
const SORT_ORDERS: Record<string, Prisma.RecipientOrderByWithRelationInput[]> = {
  newest: [{ createdAt: "desc" }, { id: "asc" }],
  oldest: [{ createdAt: "asc" }, { id: "asc" }],
  recently_sent: [{ sentAt: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }, { id: "asc" }],
  company: [{ companyName: "asc" }, { name: "asc" }, { id: "asc" }],
};

function parseStatus(value: string | null) {
  if (
    value === RecipientStatus.SENT ||
    value === RecipientStatus.PENDING ||
    value === RecipientStatus.FAILED ||
    value === RecipientStatus.SKIPPED
  ) {
    return value;
  }

  return null;
}

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

export async function GET(request: Request) {
  try {
    await requireUser();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("q")?.trim() ?? "";
    const status = parseStatus(searchParams.get("status"));
    const campaignId = searchParams.get("campaignId")?.trim() || null;
    const sort = searchParams.get("sort") ?? "newest";
    const pageSize = parsePositiveInt(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const requestedPage = parsePositiveInt(searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);

    // Scope shared by the table and the status tallies. The status filter is applied
    // only to the table so the tallies keep showing what each status tab would return.
    const scopeWhere: Prisma.RecipientWhereInput = {
      ...(campaignId ? { campaignId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { companyName: { contains: search, mode: "insensitive" } },
              { hrEmail: { contains: search, mode: "insensitive" } },
              { hrName: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const tableWhere: Prisma.RecipientWhereInput = status ? { ...scopeWhere, status } : scopeWhere;

    // The same campaign and search scope, applied to mail that already went out, so
    // the Sent tally agrees with what the Sent tab lists.
    const sentWhere: Prisma.SentEmailWhereInput = {
      ...(campaignId ? { campaignId } : {}),
      ...(search
        ? {
            OR: [
              { recipientName: { contains: search, mode: "insensitive" } },
              { companyName: { contains: search, mode: "insensitive" } },
              { hrEmail: { contains: search, mode: "insensitive" } },
              { hrName: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [grouped, totalFiltered, contactCount, sentEmailCount, campaigns] = await Promise.all([
      prisma.recipient.groupBy({
        by: ["status"],
        where: scopeWhere,
        _count: { _all: true },
      }),
      prisma.recipient.count({ where: tableWhere }),
      prisma.contact.count(),
      prisma.sentEmail.count({ where: sentWhere }),
      prisma.campaign.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          status: true,
          _count: { select: { recipients: true } },
        },
      }),
    ]);

    const countFor = (value: RecipientStatus) =>
      grouped.find((group) => group.status === value)?._count._all ?? 0;

    const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
    const page = Math.min(requestedPage, totalPages);

    const campaignOptions = campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      recipientCount: campaign._count.recipients,
      isSending: isCampaignRunning(campaign.id),
    }));

    // Sent mail no longer exists as recipient rows, so that tab reads the
    // permanent record instead. Everything else lists the live queue.
    if (status === RecipientStatus.SENT) {
      const sentTotal = sentEmailCount;
      const sentPages = Math.max(1, Math.ceil(sentTotal / pageSize));
      const sentPage = Math.min(requestedPage, sentPages);

      const sentRows = await prisma.sentEmail.findMany({
        where: sentWhere,
        orderBy: sort === "company" ? [{ companyName: "asc" }, { id: "asc" }] : [{ sentAt: "desc" }, { id: "asc" }],
        skip: (sentPage - 1) * pageSize,
        take: pageSize,
      });

      return NextResponse.json({
        mails: sentRows.map((row) => ({
          id: row.id,
          name: row.recipientName ?? "",
          companyName: row.companyName ?? "",
          hrEmail: row.hrEmail,
          hrName: row.hrName ?? "",
          status: RecipientStatus.SENT,
          emailSent: true,
          attempts: 1,
          lastError: null,
          sentAt: row.sentAt.toISOString(),
          createdAt: row.sentAt.toISOString(),
          campaign: {
            id: row.campaignId ?? "",
            name: row.campaignName ?? "Deleted campaign",
            subject: "",
            status: "",
          },
        })),
        counts: {
          total: grouped.reduce((sum, group) => sum + group._count._all, 0) + sentEmailCount,
          sent: sentEmailCount,
          failed: countFor(RecipientStatus.FAILED),
          skipped: countFor(RecipientStatus.SKIPPED),
          pending: countFor(RecipientStatus.PENDING),
        },
        page: sentPage,
        pageSize,
        totalPages: sentPages,
        totalFiltered: sentTotal,
        contactCount,
        queuedCount: countFor(RecipientStatus.PENDING),
        campaigns: campaignOptions,
        hasActiveSending: campaignOptions.some((c) => c.isSending || c.status === "ACTIVE"),
        hasRunningLoop: campaignOptions.some((c) => c.isSending),
      });
    }

    const recipients = await prisma.recipient.findMany({
      where: tableWhere,
      orderBy: SORT_ORDERS[sort] ?? SORT_ORDERS.newest,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            subject: true,
            status: true,
          },
        },
      },
    });

    return NextResponse.json({
      mails: recipients.map((recipient) => ({
        id: recipient.id,
        name: recipient.name,
        companyName: recipient.companyName,
        hrEmail: recipient.hrEmail,
        hrName: recipient.hrName,
        status: recipient.status,
        // A row still in Recipient has not been sent; sent mail lives in SentEmail.
        emailSent: false,
        attempts: recipient.attempts,
        lastError: recipient.lastError,
        sentAt: recipient.sentAt?.toISOString() ?? null,
        createdAt: recipient.createdAt.toISOString(),
        campaign: recipient.campaign,
      })),
      counts: {
        total: grouped.reduce((sum, group) => sum + group._count._all, 0) + sentEmailCount,
        sent: sentEmailCount,
        failed: countFor(RecipientStatus.FAILED),
        skipped: countFor(RecipientStatus.SKIPPED),
        pending: countFor(RecipientStatus.PENDING),
      },
      page,
      pageSize,
      totalPages,
      totalFiltered,
      // The two headline numbers: address book size, and what is left to send.
      contactCount,
      queuedCount: countFor(RecipientStatus.PENDING),
      campaigns: campaignOptions,
      // Drives polling: an ACTIVE campaign may resume at any moment.
      hasActiveSending: campaignOptions.some((campaign) => campaign.isSending || campaign.status === "ACTIVE"),
      // Drives destructive-action gating, and matches the server-side purge
      // guard: only a live send loop actually blocks deletion.
      hasRunningLoop: campaignOptions.some((campaign) => campaign.isSending),
    });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to load sent mail history." });
  }
}
