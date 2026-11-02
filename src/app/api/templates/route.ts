import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiErrors";
import { prisma } from "@/lib/prisma";
import { serializeTemplate } from "@/lib/library";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

type TemplateBody = {
  name?: string;
  subject?: string;
  body?: string;
  senderEmail?: string;
  senderPhone?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  isDefault?: boolean;
};

export async function GET() {
  try {
    await requireUser();

    const templates = await prisma.emailTemplate.findMany({
      orderBy: [{ isDefault: "desc" }, { lastUsedAt: { sort: "desc", nulls: "last" } }, { name: "asc" }],
    });

    return NextResponse.json({ templates: templates.map(serializeTemplate) });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to load templates." });
  }
}

export async function POST(request: Request) {
  try {
    await requireUser();

    const body = (await request.json()) as TemplateBody;
    const name = body.name?.trim();
    const subject = body.subject?.trim();
    const emailBody = body.body?.trim();

    if (!name || !subject || !emailBody) {
      return NextResponse.json({ error: "Name, subject, and body are required." }, { status: 400 });
    }

    const existing = await prisma.emailTemplate.findUnique({ where: { name } });

    if (existing) {
      return NextResponse.json(
        { error: `A template named "${name}" already exists. Rename it, or open it to save changes.` },
        { status: 409 },
      );
    }

    // Clearing the old default and creating the new one happen together, so a
    // failure in between cannot leave the library with no default.
    const template = await prisma.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.emailTemplate.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }

      return tx.emailTemplate.create({
        data: {
          name,
          subject,
          body: emailBody,
          senderEmail: body.senderEmail?.trim() || null,
          senderPhone: body.senderPhone?.trim() || null,
          linkedinUrl: body.linkedinUrl?.trim() || null,
          githubUrl: body.githubUrl?.trim() || null,
          isDefault: Boolean(body.isDefault),
        },
      });
    });

    return NextResponse.json({ template: serializeTemplate(template) });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to save template." });
  }
}
