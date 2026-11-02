import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { getAuthSecret } from "@/lib/auth";

// Gmail App Passwords are stored with AES-256-GCM. The key is derived from
// AUTH_SECRET, so a database dump alone does not reveal them. Changing AUTH_SECRET
// makes stored passwords unreadable; users then re-enter theirs in Settings.

const VERSION = "v1";

function key() {
  return Buffer.from(hkdfSync("sha256", getAuthSecret(), "hirenow", "gmail-app-password", 32));
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);

  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
}

/** The plain text, or null when the value is malformed or was encrypted under another key. */
export function decryptSecret(stored: string) {
  const [version, iv, tag, data] = stored.split(":");

  if (version !== VERSION || !iv || !tag || !data) {
    return null;
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
