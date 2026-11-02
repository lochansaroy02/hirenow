import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, requireAdmin } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/apiErrors";

export const runtime = "nodejs";

const MIN_PASSWORD_LENGTH = 10;

export async function GET() {
  try {
    await requireAdmin();

    const users = await prisma.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      // passwordHash is deliberately never selected.
      select: { id: true, email: true, name: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
    });

    return NextResponse.json({
      users: users.map((user) => ({
        ...user,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to load users." });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();

    const body = (await request.json()) as { email?: string; name?: string; password?: string; role?: string };
    const email = body.email?.trim().toLowerCase();
    const name = body.name?.trim();
    const password = body.password ?? "";
    const role = body.role === "ADMIN" ? "ADMIN" : "USER";

    if (!email || !name || !password) {
      return NextResponse.json({ error: "Name, email, and password are required." }, { status: 400 });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 },
      );
    }

    if (await prisma.user.findUnique({ where: { email } })) {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }

    const user = await prisma.user.create({
      data: { email, name, passwordHash: await hashPassword(password), role },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    return NextResponse.json({ user });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Unable to create the user." });
  }
}
