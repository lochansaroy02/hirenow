import { RecipientStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiErrors";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Puts this campaign's FAILED recipients back in the queue with a fresh attempt
 * count. Duplicate protection still applies when they are picked up, so a retry
 * can never email someone who has since been reached another way.
 */
export async function POST(_request: Request, context: RouteContext) {
  try {
    await requireUser();

    const { id } = await context.params;

    const requeued = await prisma.$transaction(async (tx) => {
      const result = await tx.recipient.updateMany({
        where: { campaignId: id, status: RecipientStatus.FAILED },
        data: { status: RecipientStatus.PENDING, attempts: 0, nextAttemptAt: null, lastError: null },
      });

      // A finished campaign has to be reopened, or the requeued rows would never send.
      if (result.count > 0) {
        await tx.campaign.updateMany({
          where: { id, status: "COMPLETED" },
          data: { status: "PAUSED" },
        });
      }

      return result.count;
    });

    return NextResponse.json({ requeued });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to retry failed recipients." });
  }
}
