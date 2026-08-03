import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { CsvRecipientRow, CsvRowError, CsvUploadResult } from "@/types/campaign";

const REQUIRED_HEADERS = ["name", "company_name", "hr_email", "hr_name"] as const;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const HEADER_ALIASES: Record<string, keyof CsvRecipientRow> = {
  name: "name",
  candidate_name: "name",
  "candidate name": "name",
  company_name: "company_name",
  "company name": "company_name",
  company: "company_name",
  hr_email: "hr_email",
  "hr email": "hr_email",
  email: "hr_email",
  "email address": "hr_email",
  hr_name: "hr_name",
  "hr name": "hr_name",
  recruiter: "hr_name",
  "recruiter name": "hr_name",
};

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[-\s]+/g, "_");
}

function aliasKey(header: string) {
  const trimmed = header.trim().toLowerCase();
  return HEADER_ALIASES[trimmed] ?? HEADER_ALIASES[normalizeHeader(header)];
}

export function parseCsvText(csvText: string): CsvUploadResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error(parsed.errors[0]?.message ?? "Unable to parse CSV.");
  }

  const originalHeaders = parsed.meta.fields ?? [];
  const mappedHeaders = new Map<keyof CsvRecipientRow, string>();

  for (const header of originalHeaders) {
    const mapped = aliasKey(header);
    if (mapped && !mappedHeaders.has(mapped)) {
      mappedHeaders.set(mapped, header);
    }
  }

  const missingHeaders = REQUIRED_HEADERS.filter((header) => !mappedHeaders.has(header));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required column${missingHeaders.length > 1 ? "s" : ""}: ${missingHeaders.join(", ")}.`);
  }

  const validRows: CsvRecipientRow[] = [];
  const invalidRows: CsvRowError[] = [];

  parsed.data.forEach((rawRow, index) => {
    const row: CsvRecipientRow = {
      name: (rawRow[mappedHeaders.get("name") ?? ""] ?? "").trim(),
      company_name: (rawRow[mappedHeaders.get("company_name") ?? ""] ?? "").trim(),
      hr_email: (rawRow[mappedHeaders.get("hr_email") ?? ""] ?? "").trim(),
      hr_name: (rawRow[mappedHeaders.get("hr_name") ?? ""] ?? "").trim(),
    };
    const errors: string[] = [];

    for (const key of REQUIRED_HEADERS) {
      if (!row[key]) {
        errors.push(`${key} is required`);
      }
    }

    if (row.hr_email && !EMAIL_REGEX.test(row.hr_email)) {
      errors.push("hr_email must be a valid email address");
    }

    if (errors.length > 0) {
      invalidRows.push({
        rowNumber: index + 2,
        row,
        errors,
      });
    } else {
      validRows.push(row);
    }
  });

  return {
    validRows,
    invalidRows,
    previewRows: validRows.slice(0, 20),
    validCount: validRows.length,
    totalRows: parsed.data.length,
  };
}

export function parseSpreadsheetBuffer(buffer: Buffer, filename: string): CsvUploadResult {
  const lowerName = filename.toLowerCase();

  if (lowerName.endsWith(".csv")) {
    return parseCsvText(buffer.toString("utf8"));
  }

  if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
    throw new Error("Please upload a CSV or Excel file (.csv, .xls, .xlsx).");
  }

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("The Excel file does not contain any sheets.");
  }

  const firstSheet = workbook.Sheets[firstSheetName];
  const csvText = XLSX.utils.sheet_to_csv(firstSheet, { blankrows: false });
  return parseCsvText(csvText);
}
