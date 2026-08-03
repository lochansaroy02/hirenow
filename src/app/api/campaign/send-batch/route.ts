import { NextResponse } from "next/server";
import { startCampaignJob } from "@/lib/sender";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { campaignId?: string };
    const campaignId = body.campaignId?.trim();

    if (!campaignId) {
      return NextResponse.json({ error: "campaignId is required." }, { status: 400 });
    }

    const result = await startCampaignJob(campaignId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start sending.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
