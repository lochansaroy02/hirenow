export type CsvRecipientRow = {
  name: string;
  company_name: string;
  hr_email: string;
  hr_name: string;
};

export type CsvRowError = {
  rowNumber: number;
  row: Partial<CsvRecipientRow>;
  errors: string[];
};

export type CsvUploadResult = {
  validRows: CsvRecipientRow[];
  invalidRows: CsvRowError[];
  previewRows: CsvRecipientRow[];
  validCount: number;
  totalRows: number;
  savedCount?: number;
  contacts?: SavedContact[];
};

export type SavedContact = {
  id: string;
  name: string;
  companyName: string;
  hrEmail: string;
  hrName: string;
  sourceFile: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ResumeUploadResult = {
  savedResumeId?: string;
  resumePath: string;
  filename: string;
  size: number;
  storage?: "imagekit" | "local";
  fileId?: string | null;
  storageWarning?: string;
  attachmentFilename?: string;
  extractedText?: string;
  suggestedRole?: string;
  detectedSkills?: string[];
  parseWarning?: string;
};

export type CampaignDraft = {
  csv?: CsvUploadResult;
  resume?: ResumeUploadResult;
};

export type RecipientReportRow = {
  id: string;
  name: string;
  companyName: string;
  hrEmail: string;
  hrName: string;
  emailSent: boolean;
  status: "PENDING" | "SENT" | "FAILED" | "SKIPPED";
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
};

export type MailStatusFilter = "ALL" | "SENT" | "PENDING" | "FAILED" | "SKIPPED";

export type MailSortOption = "newest" | "oldest" | "recently_sent" | "company";

export type MailRow = {
  id: string;
  name: string;
  companyName: string;
  hrEmail: string;
  hrName: string;
  status: "PENDING" | "SENT" | "FAILED" | "SKIPPED";
  emailSent: boolean;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
  campaign: {
    id: string;
    name: string;
    subject: string;
    status: string;
  };
};

export type MailCampaignOption = {
  id: string;
  name: string;
  status: string;
  recipientCount: number;
  isSending: boolean;
};

export type MailListResponse = {
  mails: MailRow[];
  counts: {
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    pending: number;
  };
  page: number;
  pageSize: number;
  totalPages: number;
  totalFiltered: number;
  contactCount: number;
  queuedCount: number;
  campaigns: MailCampaignOption[];
  hasActiveSending: boolean;
  hasRunningLoop: boolean;
};

export type CampaignStatusResponse = {
  campaign: {
    id: string;
    name: string;
    subject: string;
    resumePath: string;
    dailyLimit: number;
    safetyPercent: number;
    delayMinSec: number;
    delayMaxSec: number;
    batchSize: number;
    batchCooldownMin: number;
    status: string;
    pausedReason: string | null;
  };
  sender: {
    ownerName: string | null;
    gmailAddress: string | null;
  };
  counts: {
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    pending: number;
  };
  batch: {
    batchNumber: number;
    doneInBatch: number;
    cooldownUntil: string | null;
  } | null;
  today: {
    date: string;
    countSent: number;
    effectiveCap: number;
    remainingToday: number;
  };
  recipients: RecipientReportRow[];
  isRunning: boolean;
  needsResume: boolean;
};

export type SavedTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  senderEmail: string | null;
  senderPhone: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  isDefault: boolean;
  lastUsedAt: string | null;
  updatedAt: string;
};

export type SavedResumeEntry = {
  id: string;
  label: string;
  resumePath: string;
  attachmentFilename: string;
  originalFilename: string;
  fileSize: number;
  storage: string;
  suggestedRole: string | null;
  detectedSkills: string[];
  isDefault: boolean;
  lastUsedAt: string | null;
  updatedAt: string;
};
