import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiErrors";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const contacts = await prisma.contact.findMany({
      orderBy: [
        { companyName: "asc" },
        { name: "asc" },
      ],
    });

    return NextResponse.json({
      contacts: contacts.map((contact) => ({
        id: contact.id,
        name: contact.name,
        companyName: contact.companyName,
        hrEmail: contact.hrEmail,
        hrName: contact.hrName,
        sourceFile: contact.sourceFile,
        createdAt: contact.createdAt.toISOString(),
        updatedAt: contact.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to load saved contacts." });
  }
}
