import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import { apiErrorResponse } from "@/lib/apiErrors";
import { parseSpreadsheetBuffer } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import type { CsvRecipientRow } from "@/types/campaign";

export const runtime = "nodejs";
export const maxDuration = 300;

const UPSERT_BATCH_SIZE = 500;

function dedupeRowsByEmail(rows: CsvRecipientRow[]) {
  return Array.from(
    rows.reduce((map, row) => {
      map.set(row.hr_email.toLowerCase(), row);
      return map;
    }, new Map<string, CsvRecipientRow>()).values(),
  );
}

async function upsertContacts(rows: CsvRecipientRow[], sourceFile: string) {
  for (let index = 0; index < rows.length; index += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(index, index + UPSERT_BATCH_SIZE);

    await prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "Contact" ("id", "name", "companyName", "hrEmail", "hrName", "sourceFile", "createdAt", "updatedAt")
        VALUES ${Prisma.join(
          batch.map((row) => Prisma.sql`(${uuidv4()}, ${row.name}, ${row.company_name}, ${row.hr_email}, ${row.hr_name}, ${sourceFile}, NOW(), NOW())`),
        )}
        ON CONFLICT ("hrEmail") DO UPDATE SET
          "name" = EXCLUDED."name",
          "companyName" = EXCLUDED."companyName",
          "hrName" = EXCLUDED."hrName",
          "sourceFile" = EXCLUDED."sourceFile",
          "updatedAt" = NOW()
      `,
    );
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV or Excel file is required." }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const result = parseSpreadsheetBuffer(bytes, file.name);
    const uniqueValidRows = dedupeRowsByEmail(result.validRows);

    if (uniqueValidRows.length > 0) {
      await upsertContacts(uniqueValidRows, file.name);
    }

    const contacts = uniqueValidRows.length > 0
      ? await prisma.contact.findMany({
          where: { hrEmail: { in: uniqueValidRows.map((row) => row.hr_email) } },
          orderBy: [
            { companyName: "asc" },
            { name: "asc" },
          ],
        })
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
    return apiErrorResponse(error, { fallback: "File import failed.", fallbackStatus: 400 });
  }
}
