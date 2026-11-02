import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiErrors";
import { startCampaignJob } from "@/lib/sender";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const body = await request.json() as { campaignId?: string };
    const campaignId = body.campaignId?.trim();

    if (!campaignId) {
      return NextResponse.json({ error: "campaignId is required." }, { status: 400 });
    }

    const result = await startCampaignJob(campaignId, user);
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to start sending." });
  }
}
