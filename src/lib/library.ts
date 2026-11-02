import type { EmailTemplate, SavedResume } from "@prisma/client";

export function serializeTemplate(template: EmailTemplate) {
  return {
    id: template.id,
    name: template.name,
    subject: template.subject,
    body: template.body,
    senderEmail: template.senderEmail,
    senderPhone: template.senderPhone,
    linkedinUrl: template.linkedinUrl,
    githubUrl: template.githubUrl,
    isDefault: template.isDefault,
    lastUsedAt: template.lastUsedAt?.toISOString() ?? null,
    updatedAt: template.updatedAt.toISOString(),
  };
}

export function serializeResume(resume: SavedResume) {
  return {
    id: resume.id,
    label: resume.label,
    resumePath: resume.resumePath,
    attachmentFilename: resume.attachmentFilename,
    originalFilename: resume.originalFilename,
    fileSize: resume.fileSize,
    storage: resume.storage,
    suggestedRole: resume.suggestedRole,
    detectedSkills: resume.detectedSkills,
    isDefault: resume.isDefault,
    lastUsedAt: resume.lastUsedAt?.toISOString() ?? null,
    updatedAt: resume.updatedAt.toISOString(),
  };
}
