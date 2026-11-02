-- CreateEnum
CREATE TYPE "RecipientStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Untitled Campaign',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "resumePath" TEXT NOT NULL,
    "dailyLimit" INTEGER NOT NULL DEFAULT 500,
    "safetyPercent" INTEGER NOT NULL DEFAULT 80,
    "delayMinSec" INTEGER NOT NULL DEFAULT 8,
    "delayMaxSec" INTEGER NOT NULL DEFAULT 20,
    "batchSize" INTEGER NOT NULL DEFAULT 50,
    "batchCooldownMin" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "hrEmail" TEXT NOT NULL,
    "hrName" TEXT NOT NULL,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "status" "RecipientStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "hrEmail" TEXT NOT NULL,
    "hrName" TEXT NOT NULL,
    "sourceFile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentEmail" (
    "id" TEXT NOT NULL,
    "hrEmail" TEXT NOT NULL,
    "hrName" TEXT,
    "companyName" TEXT,
    "recipientName" TEXT,
    "campaignId" TEXT,
    "campaignName" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "senderEmail" TEXT,
    "senderPhone" TEXT,
    "linkedinUrl" TEXT,
    "githubUrl" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedResume" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "resumePath" TEXT NOT NULL,
    "attachmentFilename" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storage" TEXT NOT NULL DEFAULT 'imagekit',
    "fileId" TEXT,
    "suggestedRole" TEXT,
    "detectedSkills" TEXT[],
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedResume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySendLog" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "countSent" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailySendLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Recipient_campaignId_status_idx" ON "Recipient"("campaignId", "status");

-- CreateIndex
CREATE INDEX "Recipient_campaignId_emailSent_idx" ON "Recipient"("campaignId", "emailSent");

-- CreateIndex
CREATE INDEX "Recipient_hrEmail_status_idx" ON "Recipient"("hrEmail", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_hrEmail_key" ON "Contact"("hrEmail");

-- CreateIndex
CREATE INDEX "Contact_companyName_idx" ON "Contact"("companyName");

-- CreateIndex
CREATE UNIQUE INDEX "SentEmail_hrEmail_key" ON "SentEmail"("hrEmail");

-- CreateIndex
CREATE INDEX "SentEmail_sentAt_idx" ON "SentEmail"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_name_key" ON "EmailTemplate"("name");

-- CreateIndex
CREATE INDEX "EmailTemplate_lastUsedAt_idx" ON "EmailTemplate"("lastUsedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedResume_resumePath_key" ON "SavedResume"("resumePath");

-- CreateIndex
CREATE INDEX "SavedResume_lastUsedAt_idx" ON "SavedResume"("lastUsedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "DailySendLog_campaignId_date_key" ON "DailySendLog"("campaignId", "date");

-- AddForeignKey
ALTER TABLE "Recipient" ADD CONSTRAINT "Recipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySendLog" ADD CONSTRAINT "DailySendLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

