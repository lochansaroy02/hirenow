import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secrets";
import { gmailTransport, type GmailCredentials } from "@/lib/mailer";

const APP_PASSWORD = /^[a-z]{16}$/;

/**
 * Google shows App Passwords as four groups of four letters ("abcd efgh ijkl mnop").
 * Accepts that, with or without spaces, and returns the 16 letters, or null.
 */
export function normalizeAppPassword(value: string) {
  const compact = value.replace(/\s+/g, "").toLowerCase();
  return APP_PASSWORD.test(compact) ? compact : null;
}

/** The user's saved Gmail credentials, decrypted, or null if none are usable. */
export async function getGmailCredentials(userId: string): Promise<GmailCredentials | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, gmailAddress: true, gmailAppPasswordEnc: true, senderName: true },
  });

  if (!user?.gmailAddress || !user.gmailAppPasswordEnc) {
    return null;
  }

  const pass = decryptSecret(user.gmailAppPasswordEnc);

  if (!pass) {
    return null;
  }

  return { user: user.gmailAddress, pass, senderName: user.senderName || user.name };
}

/** Turns Gmail's SMTP errors into something a person can act on. */
export function explainGmailError(error: unknown) {
  const details = error as { code?: string; responseCode?: number; message?: string } | null;

  if (details?.code === "EAUTH" || details?.responseCode === 535 || details?.responseCode === 534) {
    return (
      "Gmail rejected this address and App Password. Check that the address is exactly the account you created the " +
      "App Password in, that 2-Step Verification is on, and that you pasted the 16-letter App Password, not your " +
      "normal Google password."
    );
  }

  if (details?.code === "ETIMEDOUT" || details?.code === "ECONNECTION" || details?.code === "EDNS") {
    return "Could not reach Gmail's mail server. Check this machine's internet connection and try again.";
  }

  return `Gmail did not accept the login: ${details?.message ?? "unknown error"}`;
}

/** Logs in to Gmail's SMTP server without sending anything. Throws a readable Error on failure. */
export async function verifyGmailLogin(credentials: GmailCredentials) {
  const transport = gmailTransport(credentials);

  try {
    await transport.verify();
  } catch (error) {
    throw new Error(explainGmailError(error));
  } finally {
    transport.close();
  }
}
