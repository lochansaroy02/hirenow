import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { isImageKitConfigured, uploadResumeToImageKit } from "@/lib/imagekit";
import { analyzeResumePdf, slugifyResumeRole } from "@/lib/resumeAnalyzer";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

async function saveToLocalDisk(bytes: Buffer, attachmentFilename: string) {
  const uploadDir = path.join(process.cwd(), "public", "uploads", "resumes", uuidv4());
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, attachmentFilename), bytes);

  return `/uploads/resumes/${path.basename(uploadDir)}/${attachmentFilename}`;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Resume PDF is required." }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Resume must be a PDF file." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Resume must be 5MB or smaller." }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    let suggestedRole = "Full Stack Developer";
    let detectedSkills: string[] = [];
    let extractedText = "";
    let parseWarning: string | undefined;

    try {
      const analysis = await analyzeResumePdf(bytes);
      suggestedRole = analysis.suggestedRole;
      detectedSkills = analysis.detectedSkills;
      extractedText = analysis.extractedText;
    } catch {
      parseWarning = "Resume uploaded, but the PDF text could not be extracted. The file name and template will use Full Stack Developer.";
    }

    const attachmentFilename = `${slugifyResumeRole(suggestedRole)}-resume.pdf`;
    let resumePath: string;
    let fileId: string | null = null;
    let storage: "imagekit" | "local";

    if (isImageKitConfigured()) {
      // A failed ImageKit upload is surfaced instead of silently falling back to
      // disk, so a broken key never looks like a successful upload.
      const uploaded = await uploadResumeToImageKit(bytes, attachmentFilename);
      resumePath = uploaded.url;
      fileId = uploaded.fileId;
      storage = "imagekit";
    } else {
      resumePath = await saveToLocalDisk(bytes, attachmentFilename);
      storage = "local";
    }

    return NextResponse.json({
      resumePath,
      storage,
      fileId,
      storageWarning: storage === "local"
        ? "Saved to this machine because IMAGEKIT_PRIVATE_KEY is not set. Add it to .env to store resumes in ImageKit."
        : undefined,
      filename: file.name,
      attachmentFilename,
      size: file.size,
      suggestedRole,
      detectedSkills,
      extractedText,
      parseWarning,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: message || "Resume upload failed." }, { status: 500 });
  }
}
