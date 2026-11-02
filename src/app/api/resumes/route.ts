import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiErrors";
import { prisma } from "@/lib/prisma";
import { serializeResume } from "@/lib/library";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireUser();

    const resumes = await prisma.savedResume.findMany({
      orderBy: [{ isDefault: "desc" }, { lastUsedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    });

    return NextResponse.json({ resumes: resumes.map(serializeResume) });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to load saved resumes." });
  }
}
