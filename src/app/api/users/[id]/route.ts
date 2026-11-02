import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, requireAdmin, setSessionCookie } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/apiErrors";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const MIN_PASSWORD_LENGTH = 10;

/** Would this change leave the system with no way for anyone to administer it? */
async function wouldRemoveLastAdmin(userId: string) {
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });

  if (target?.role !== "ADMIN") {
    return false;
  }

  return (await prisma.user.count({ where: { role: "ADMIN", isActive: true } })) <= 1;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const body = (await request.json()) as { name?: string; role?: string; isActive?: boolean; password?: string };

    const target = await prisma.user.findUnique({ where: { id } });

    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const losesAdmin = (body.role !== undefined && body.role !== "ADMIN") || body.isActive === false;

    if (losesAdmin && (await wouldRemoveLastAdmin(id))) {
      return NextResponse.json(
        { error: "This is the last active administrator. Promote another admin first." },
        { status: 409 },
      );
    }

    if (body.password !== undefined && body.password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 },
      );
    }

    // A deactivation or password reset must end sessions already open elsewhere,
    // not just block new sign-ins.
    const revokes = body.isActive === false || Boolean(body.password);

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.role !== undefined ? { role: body.role === "ADMIN" ? "ADMIN" : "USER" } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.password ? { passwordHash: await hashPassword(body.password) } : {}),
        ...(revokes ? { tokenVersion: { increment: 1 } } : {}),
      },
      select: { id: true, email: true, name: true, role: true, isActive: true, tokenVersion: true },
    });

    const { tokenVersion, ...user } = updated;
    const selfChanged = admin.id === id;

    // An admin resetting their own password keeps this session, under the new version.
    if (selfChanged && revokes && user.isActive) {
      await setSessionCookie({ id: user.id, email: user.email, name: user.name, role: user.role, tokenVersion });
    }

    return NextResponse.json({ user, selfChanged });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to update the user." });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;

    if (admin.id === id) {
      return NextResponse.json({ error: "You cannot delete your own account." }, { status: 409 });
    }

    if (await wouldRemoveLastAdmin(id)) {
      return NextResponse.json(
        { error: "This is the last active administrator. Promote another admin first." },
        { status: 409 },
      );
    }

    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to delete the user." });
  }
}
