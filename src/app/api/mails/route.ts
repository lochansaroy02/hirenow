import { Prisma, RecipientStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiErrors";
import { isCampaignRunning } from "@/lib/sender";
import { prisma } from "@/lib/prisma";

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
  if (value === RecipientStatus.SENT || value === RecipientStatus.PENDING || value === RecipientStatus.FAILED) {
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

    const [grouped, totalFiltered, campaigns] = await Promise.all([
      prisma.recipient.groupBy({
        by: ["status"],
        where: scopeWhere,
        _count: { _all: true },
      }),
      prisma.recipient.count({ where: tableWhere }),
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

    const campaignOptions = campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      recipientCount: campaign._count.recipients,
      isSending: isCampaignRunning(campaign.id),
    }));

    return NextResponse.json({
      mails: recipients.map((recipient) => ({
        id: recipient.id,
        name: recipient.name,
        companyName: recipient.companyName,
        hrEmail: recipient.hrEmail,
        hrName: recipient.hrName,
        status: recipient.status,
        emailSent: recipient.emailSent || recipient.status === RecipientStatus.SENT,
        attempts: recipient.attempts,
        lastError: recipient.lastError,
        sentAt: recipient.sentAt?.toISOString() ?? null,
        createdAt: recipient.createdAt.toISOString(),
        campaign: recipient.campaign,
      })),
      counts: {
        total: grouped.reduce((sum, group) => sum + group._count._all, 0),
        sent: countFor(RecipientStatus.SENT),
        failed: countFor(RecipientStatus.FAILED),
        pending: countFor(RecipientStatus.PENDING),
      },
      page,
      pageSize,
      totalPages,
      totalFiltered,
      campaigns: campaignOptions,
      hasActiveSending: campaignOptions.some((campaign) => campaign.isSending || campaign.status === "ACTIVE"),
    });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to load sent mail history." });
  }
}
