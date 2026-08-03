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
