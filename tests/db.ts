import { prisma } from "@/lib/prisma";

export { hasTestDatabase } from "./setup";

export async function resetDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE "Recipient", "DailySendLog", "Campaign", "SentEmail", "SenderDailyLog",
             "Contact", "EmailTemplate", "SavedResume", "User" CASCADE
  `);
}
