import { NextResponse } from "next/server";
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
    const message = error instanceof Error ? error.message : "Unable to update campaign.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
