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
  status: "PENDING" | "SENT" | "FAILED";
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
};

export type MailStatusFilter = "ALL" | "SENT" | "PENDING" | "FAILED";

export type MailSortOption = "newest" | "oldest" | "recently_sent" | "company";

export type MailRow = {
  id: string;
  name: string;
  companyName: string;
  hrEmail: string;
  hrName: string;
  status: "PENDING" | "SENT" | "FAILED";
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
    pending: number;
  };
  page: number;
  pageSize: number;
  totalPages: number;
  totalFiltered: number;
  campaigns: MailCampaignOption[];
  hasActiveSending: boolean;
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
    status: string;
  };
  counts: {
    total: number;
    sent: number;
    failed: number;
    pending: number;
  };
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
