-- DropIndex
DROP INDEX "SentEmail_hrEmail_key";

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "pausedReason" TEXT,
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "SentEmail" ADD COLUMN     "senderEmail" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "gmailAddress" TEXT,
ADD COLUMN     "gmailAppPasswordEnc" TEXT,
ADD COLUMN     "gmailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "senderName" TEXT;

-- AlterTable
ALTER TABLE "SenderDailyLog" DROP CONSTRAINT "SenderDailyLog_pkey",
ADD COLUMN     "sender" TEXT NOT NULL DEFAULT '',
ADD CONSTRAINT "SenderDailyLog_pkey" PRIMARY KEY ("sender", "date");

-- CreateIndex
CREATE INDEX "SentEmail_hrEmail_idx" ON "SentEmail"("hrEmail");

-- CreateIndex
CREATE UNIQUE INDEX "SentEmail_senderEmail_hrEmail_key" ON "SentEmail"("senderEmail", "hrEmail");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

