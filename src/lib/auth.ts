import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "hirenow_session";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const BCRYPT_ROUNDS = 12;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

/** What the token carries: the user plus the tokenVersion it was issued under. */
type SessionToken = SessionUser & { tokenVersion: number };

/**
 * The signing key. Deliberately throws rather than falling back to a default:
 * a predictable secret would let anyone mint a valid admin token.
 */
export function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET must be set to a random string of at least 32 characters. Generate one with: openssl rand -base64 32",
    );
  }

  return secret;
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export function signSessionToken(user: SessionToken) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role, ver: user.tokenVersion },
    getAuthSecret(),
    { expiresIn: TOKEN_TTL_SECONDS },
  );
}

/** Returns the session encoded in a token, or null if it is missing/invalid/expired. */
export function readSessionToken(token: string | undefined): SessionToken | null {
  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, getAuthSecret());

    if (typeof payload === "string" || !payload.sub) {
      return null;
    }

    return {
      id: String(payload.sub),
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role: payload.role === "ADMIN" ? "ADMIN" : "USER",
      tokenVersion: typeof payload.ver === "number" ? payload.ver : -1,
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(user: SessionToken) {
  const store = await cookies();

  store.set(SESSION_COOKIE, signSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/** The session from the request cookie, without touching the database. */
export async function getSession(): Promise<SessionToken | null> {
  const store = await cookies();
  return readSessionToken(store.get(SESSION_COOKIE)?.value);
}

/**
 * The session, re-checked against the database: the account must still exist, be
 * active, and the token must carry the current tokenVersion. Role comes from the
 * database, so a demotion takes effect on the very next request.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, email: true, name: true, role: true, isActive: true, tokenVersion: true },
  });

  if (!user || !user.isActive || user.tokenVersion !== session.tokenVersion) {
    return null;
  }

  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export class AuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Throws AuthError(401) when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new AuthError("You must be signed in.", 401);
  }

  return user;
}

/** Throws AuthError(401) when signed out, or AuthError(403) when not an admin. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();

  if (user.role !== "ADMIN") {
    throw new AuthError("This action is restricted to administrators.", 403);
  }

  return user;
}

/** Invalidates every token already issued to this user, on every device. */
export async function revokeSessions(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
}
