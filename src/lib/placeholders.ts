import type { CsvRecipientRow } from "@/types/campaign";

type PrismaRecipientLike = {
  name: string;
  companyName: string;
  hrEmail: string;
  hrName: string;
};

type PlaceholderSource = CsvRecipientRow | PrismaRecipientLike;

export function mergePlaceholders(template: string, row: PlaceholderSource) {
  const values = "company_name" in row
    ? {
        name: row.name,
        company_name: row.company_name,
        hr_name: row.hr_name,
      }
    : {
        name: row.name,
        company_name: row.companyName,
        hr_name: row.hrName,
      };

  return template
    .replaceAll("{{name}}", values.name)
    .replaceAll("{{company_name}}", values.company_name)
    .replaceAll("{{hr_name}}", values.hr_name);
}

export function textToHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/\n/g, "<br />");
}
