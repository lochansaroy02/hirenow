import ImageKit, { toFile } from "@imagekit/nodejs";

export type UploadedResume = {
  url: string;
  fileId: string | null;
  filePath: string | null;
  size: number;
};

const DEFAULT_RESUME_FOLDER = "/hirenow/resumes";

export function isImageKitConfigured() {
  return Boolean(process.env.IMAGEKIT_PRIVATE_KEY);
}

function getClient() {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("IMAGEKIT_PRIVATE_KEY must be set to upload resumes to ImageKit.");
  }

  return new ImageKit({ privateKey });
}

export async function uploadResumeToImageKit(buffer: Buffer, fileName: string): Promise<UploadedResume> {
  try {
    const response = await getClient().files.upload({
      file: await toFile(buffer, fileName),
      fileName,
      folder: process.env.IMAGEKIT_FOLDER || DEFAULT_RESUME_FOLDER,
      // ImageKit appends a suffix on collision so one campaign never overwrites another's resume.
      useUniqueFileName: true,
    });

    if (!response.url) {
      throw new Error("ImageKit accepted the upload but returned no file URL.");
    }

    return {
      url: response.url,
      fileId: response.fileId ?? null,
      filePath: response.filePath ?? null,
      size: response.size ?? buffer.byteLength,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ImageKit error";
    throw new Error(`ImageKit upload failed: ${message}`);
  }
}
