import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiErrors";
import { requireUser } from "@/lib/auth";
import { EMAIL_REGEX } from "@/lib/csv";
import { getGmailCredentials, normalizeAppPassword, verifyGmailLogin } from "@/lib/gmailAccount";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/secrets";
import { stopCampaignJob } from "@/lib/sender";

export const runtime = "nodejs";

type SaveBody = {
  gmailAddress?: string;
  senderName?: string;
  appPassword?: string;
};

/** The signed-in user's Gmail sending account. The App Password is never returned. */
export async function GET() {
  try {
    const user = await requireUser();
    const account = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { gmailAddress: true, senderName: true, gmailVerifiedAt: true, name: true },
    });
    const credentials = await getGmailCredentials(user.id);

    return NextResponse.json({
      gmailAddress: account.gmailAddress,
      senderName: account.senderName ?? account.name,
      connected: Boolean(credentials),
      // An address is saved but its password no longer decrypts (AUTH_SECRET changed).
      needsPassword: Boolean(account.gmailAddress) && !credentials,
      verifiedAt: account.gmailVerifiedAt?.toISOString() ?? null,
    });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to load your Gmail account." });
  }
}

/**
 * Saves the Gmail account after logging in to Gmail with it, so a typo or a wrong
 * password is caught here rather than when a campaign starts.
 */
export async function PUT(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as SaveBody;
    const gmailAddress = body.gmailAddress?.trim().toLowerCase() ?? "";
    const senderName = body.senderName?.trim() ?? "";
    const typedPassword = body.appPassword?.trim() ?? "";

    if (!EMAIL_REGEX.test(gmailAddress)) {
      return NextResponse.json({ error: "Enter the full Gmail address, for example you@gmail.com." }, { status: 400 });
    }

    if (!senderName || senderName.length > 100) {
      return NextResponse.json({ error: "Enter the name recruiters should see, up to 100 characters." }, { status: 400 });
    }

    const existing = await getGmailCredentials(user.id);
    let pass: string;

    if (typedPassword) {
      const normalized = normalizeAppPassword(typedPassword);

      if (!normalized) {
        return NextResponse.json(
          {
            error:
              "That is not an App Password. It is 16 letters, shown by Google as four groups of four. Your normal Google password will not work.",
          },
          { status: 400 },
        );
      }

      pass = normalized;
    } else if (existing && existing.user.toLowerCase() === gmailAddress) {
      pass = existing.pass;
    } else {
      return NextResponse.json({ error: "Enter the App Password for this Gmail address." }, { status: 400 });
    }

    const loginChanged = !existing || existing.user.toLowerCase() !== gmailAddress || existing.pass !== pass;

    if (loginChanged) {
      try {
        await verifyGmailLogin({ user: gmailAddress, pass, senderName });
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Gmail did not accept the login." },
          { status: 422 },
        );
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        gmailAddress,
        senderName,
        gmailAppPasswordEnc: encryptSecret(pass),
        ...(loginChanged ? { gmailVerifiedAt: new Date() } : {}),
      },
    });

    return NextResponse.json({ connected: true, gmailAddress, senderName, verified: loginChanged });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to save your Gmail account." });
  }
}

/** Disconnects Gmail. Campaigns that were sending from it are paused, with the reason shown. */
export async function DELETE() {
  try {
    const user = await requireUser();

    const sending = await prisma.campaign.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: { id: true },
    });

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { gmailAddress: null, gmailAppPasswordEnc: null, gmailVerifiedAt: null },
      }),
      prisma.campaign.updateMany({
        where: { id: { in: sending.map((campaign) => campaign.id) } },
        data: { status: "PAUSED", pausedReason: "Gmail was disconnected. Connect it again in Settings, then resume." },
      }),
    ]);

    for (const campaign of sending) {
      stopCampaignJob(campaign.id);
    }

    return NextResponse.json({ connected: false, pausedCampaigns: sending.length });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to disconnect your Gmail account." });
  }
}
