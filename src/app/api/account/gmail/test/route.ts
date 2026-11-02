import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiErrors";
import { requireUser } from "@/lib/auth";
import { explainGmailError, getGmailCredentials } from "@/lib/gmailAccount";
import { gmailTransport } from "@/lib/mailer";

export const runtime = "nodejs";

/** Sends one email from the user's Gmail to itself, to prove sending really works. */
export async function POST() {
  try {
    const user = await requireUser();
    const credentials = await getGmailCredentials(user.id);

    if (!credentials) {
      return NextResponse.json({ error: "Connect your Gmail account first." }, { status: 400 });
    }

    const transport = gmailTransport(credentials);

    try {
      await transport.sendMail({
        from: { name: credentials.senderName, address: credentials.user },
        to: credentials.user,
        subject: "HireNow test email",
        text: "This is a test from HireNow. Your Gmail account is connected and can send campaign emails.",
      });
    } catch (error) {
      return NextResponse.json({ error: explainGmailError(error) }, { status: 422 });
    } finally {
      transport.close();
    }

    return NextResponse.json({ sentTo: credentials.user });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to send the test email." });
  }
}
