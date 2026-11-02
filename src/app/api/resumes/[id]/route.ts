import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiErrors";
import { prisma } from "@/lib/prisma";
import { serializeResume } from "@/lib/library";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type PatchBody = {
  label?: string;
  isDefault?: boolean;
  markUsed?: boolean;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireUser();

    const { id } = await context.params;
    const body = (await request.json()) as PatchBody;

    if (!(await prisma.savedResume.findUnique({ where: { id } }))) {
      return NextResponse.json({ error: "Saved resume not found." }, { status: 404 });
    }

    const resume = await prisma.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.savedResume.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }

      return tx.savedResume.update({
        where: { id },
        data: {
          ...(body.label !== undefined ? { label: body.label.trim() } : {}),
          ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
          ...(body.markUsed ? { lastUsedAt: new Date() } : {}),
        },
      });
    });

    return NextResponse.json({ resume: serializeResume(resume) });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to update saved resume." });
  }
}

// Removes the library entry only. The file itself stays in ImageKit so campaigns
// that already reference it keep working and can still attach it.
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireUser();

    const { id } = await context.params;
    await prisma.savedResume.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to delete saved resume." });
  }
}
