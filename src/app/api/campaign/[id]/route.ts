import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiErrors";
import { prisma } from "@/lib/prisma";
import { repaceCampaignJob, stopCampaignJob } from "@/lib/sender";
import { requireUser } from "@/lib/auth";
import { validatePacing, type Pacing } from "@/lib/pacing";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PatchBody = Partial<Pacing> & { status?: string };

const PACING_KEYS = ["delayMinSec", "delayMaxSec", "batchSize", "batchCooldownMin"] as const;

/**
 * Pauses a campaign, changes its sending pace, or both. Pace can be changed while
 * the campaign is sending: the wait in progress is re-timed with the new delay, and
 * batch settings apply from the next email.
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireUser();

    const { id } = await context.params;
    const body = (await request.json()) as PatchBody;
    const pausing = body.status !== undefined;
    const changesPacing = PACING_KEYS.some((key) => body[key] !== undefined);

    if (pausing && body.status !== "PAUSED") {
      return NextResponse.json({ error: "Only PAUSED status updates are supported." }, { status: 400 });
    }

    if (!pausing && !changesPacing) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const current = await prisma.campaign.findUnique({ where: { id } });

    if (!current) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    const pacing: Pacing = {
      delayMinSec: Number(body.delayMinSec ?? current.delayMinSec),
      delayMaxSec: Number(body.delayMaxSec ?? current.delayMaxSec),
      batchSize: Number(body.batchSize ?? current.batchSize),
      batchCooldownMin: Number(body.batchCooldownMin ?? current.batchCooldownMin),
    };

    if (changesPacing) {
      const invalid = validatePacing(pacing);

      if (invalid) {
        return NextResponse.json({ error: invalid }, { status: 400 });
      }
    }

    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        ...(changesPacing ? pacing : {}),
        ...(pausing ? { status: "PAUSED" } : {}),
      },
    });

    if (pausing) {
      stopCampaignJob(id);
    } else {
      repaceCampaignJob(id);
    }

    return NextResponse.json({
      campaignId: campaign.id,
      status: campaign.status,
      pacing: {
        delayMinSec: campaign.delayMinSec,
        delayMaxSec: campaign.delayMaxSec,
        batchSize: campaign.batchSize,
        batchCooldownMin: campaign.batchCooldownMin,
      },
    });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to update campaign." });
  }
}
