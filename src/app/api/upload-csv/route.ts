import { NextResponse } from "next/server";
import { parseSpreadsheetBuffer } from "@/lib/csv";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV or Excel file is required." }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const result = parseSpreadsheetBuffer(bytes, file.name);
    const contacts = result.validRows.length > 0
      ? await prisma.$transaction(
          result.validRows.map((row) => prisma.contact.upsert({
            where: { hrEmail: row.hr_email },
            create: {
              name: row.name,
              companyName: row.company_name,
              hrEmail: row.hr_email,
              hrName: row.hr_name,
              sourceFile: file.name,
            },
            update: {
              name: row.name,
              companyName: row.company_name,
              hrName: row.hr_name,
              sourceFile: file.name,
            },
          })),
        )
      : [];

    return NextResponse.json({
      ...result,
      savedCount: contacts.length,
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
    const message = error instanceof Error ? error.message : "File import failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
