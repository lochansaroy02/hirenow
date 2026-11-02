import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSessionCookie, verifyPassword } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/apiErrors";
import { clearAttempts, clientAddress, isRateLimited, recordAttempt } from "@/lib/rateLimit";

export const runtime = "nodejs";

// One message for every failure mode, so the response cannot be used to discover
// which addresses have accounts.
const REJECTED = "Email or password is incorrect.";

const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60_000;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    // Keyed by address and account, so one attacker cannot lock a user out from
    // everywhere, and one IP cannot spray guesses across many accounts unthrottled.
    const limitKey = `login:${clientAddress(request)}:${email}`;

    if (isRateLimited(limitKey, MAX_FAILURES)) {
      return NextResponse.json(
        { error: "Too many failed sign-in attempts. Try again in 15 minutes." },
        { status: 429 },
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
      recordAttempt(limitKey, FAILURE_WINDOW_MS);
      return NextResponse.json({ error: REJECTED }, { status: 401 });
    }

    clearAttempts(limitKey);

    const session = { id: user.id, email: user.email, name: user.name, role: user.role };
    await setSessionCookie({ ...session, tokenVersion: user.tokenVersion });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    return NextResponse.json({ user: session });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to sign in." });
  }
}
