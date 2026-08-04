import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiErrors";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { status?: string };

    if (body.status !== "PAUSED") {
      return NextResponse.json({ error: "Only PAUSED status updates are supported." }, { status: 400 });
    }

    const campaign = await prisma.campaign.update({
      where: { id },
      data: { status: "PAUSED" },
    });

    return NextResponse.json({ campaignId: campaign.id, status: campaign.status });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to update campaign." });
  }
}
