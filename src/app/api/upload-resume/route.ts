import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { analyzeResumePdf, slugifyResumeRole } from "@/lib/resumeAnalyzer";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

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

    const uploadDir = path.join(process.cwd(), "public", "uploads", "resumes", uuidv4());
    await mkdir(uploadDir, { recursive: true });

    const attachmentFilename = `${slugifyResumeRole(suggestedRole)}-resume.pdf`;
    const absolutePath = path.join(uploadDir, attachmentFilename);
    await writeFile(absolutePath, bytes);

    return NextResponse.json({
      resumePath: `/uploads/resumes/${path.basename(uploadDir)}/${attachmentFilename}`,
      filename: file.name,
      attachmentFilename,
      size: file.size,
      suggestedRole,
      detectedSkills,
      extractedText,
      parseWarning,
    });
  } catch {
    return NextResponse.json({ error: "Resume upload failed." }, { status: 500 });
  }
}
