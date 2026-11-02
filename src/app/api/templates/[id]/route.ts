import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiErrors";
import { prisma } from "@/lib/prisma";
import { serializeTemplate } from "@/lib/library";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type PatchBody = {
  name?: string;
  subject?: string;
  body?: string;
  senderEmail?: string;
  senderPhone?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  isDefault?: boolean;
  markUsed?: boolean;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireUser();

    const { id } = await context.params;
    const body = (await request.json()) as PatchBody;

    if (!(await prisma.emailTemplate.findUnique({ where: { id } }))) {
      return NextResponse.json({ error: "Template not found." }, { status: 404 });
    }

    // Only one template can be the default, so clear the others in the same transaction.
    const template = await prisma.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.emailTemplate.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }

      return tx.emailTemplate.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.subject !== undefined ? { subject: body.subject.trim() } : {}),
          ...(body.body !== undefined ? { body: body.body.trim() } : {}),
          ...(body.senderEmail !== undefined ? { senderEmail: body.senderEmail.trim() || null } : {}),
          ...(body.senderPhone !== undefined ? { senderPhone: body.senderPhone.trim() || null } : {}),
          ...(body.linkedinUrl !== undefined ? { linkedinUrl: body.linkedinUrl.trim() || null } : {}),
          ...(body.githubUrl !== undefined ? { githubUrl: body.githubUrl.trim() || null } : {}),
          ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
          ...(body.markUsed ? { lastUsedAt: new Date() } : {}),
        },
      });
    });

    return NextResponse.json({ template: serializeTemplate(template) });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to update template." });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireUser();

    const { id } = await context.params;
    await prisma.emailTemplate.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to delete template." });
  }
}
