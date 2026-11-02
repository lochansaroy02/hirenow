import { NextResponse } from "next/server";
import { clearSessionCookie, getCurrentUser, getSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/apiErrors";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secrets";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();

    // A cookie the proxy accepts (valid signature) but the database rejects: the user
    // was deleted or deactivated, or the token predates a revocation. Clear it, so the
    // proxy sends the next page load to sign-in instead of rendering a page whose every
    // API call fails.
    if (!user && (await getSession())) {
      await clearSessionCookie();
    }
    const account = user
      ? await prisma.user.findUnique({
          where: { id: user.id },
          select: { gmailAddress: true, gmailAppPasswordEnc: true },
        })
      : null;

    return NextResponse.json({
      user,
      // Drives the "connect your Gmail" redirect after sign-in. A stored password
      // that no longer decrypts (AUTH_SECRET changed) counts as not connected.
      gmail: user
        ? {
            connected: Boolean(
              account?.gmailAddress && account.gmailAppPasswordEnc && decryptSecret(account.gmailAppPasswordEnc),
            ),
            address: account?.gmailAddress ?? null,
          }
        : null,
    });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to read the session." });
  }
}
