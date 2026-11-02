import { NextResponse } from "next/server";
import { clearSessionCookie, getCurrentUser, revokeSessions } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  // Clearing the cookie alone leaves a copied token valid for days, so the token
  // version is bumped too. This signs the user out on every device.
  const user = await getCurrentUser().catch(() => null);

  if (user) {
    await revokeSessions(user.id);
  }

  await clearSessionCookie();
  return NextResponse.json({ signedOut: true });
}
