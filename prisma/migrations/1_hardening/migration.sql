-- CreateEnum
CREATE TYPE "SendState" AS ENUM ('SENDING', 'SENT');

-- AlterTable
ALTER TABLE "Recipient" ADD COLUMN     "nextAttemptAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SentEmail" ADD COLUMN     "state" "SendState" NOT NULL DEFAULT 'SENT';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SenderDailyLog" (
    "date" TEXT NOT NULL,
    "countSent" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SenderDailyLog_pkey" PRIMARY KEY ("date")
);


-- Carry existing per-campaign counts into the account-wide counter, so today's
-- sends made before this migration still count against today's cap.
INSERT INTO "SenderDailyLog" ("date", "countSent")
SELECT "date", SUM("countSent") FROM "DailySendLog" GROUP BY "date";
