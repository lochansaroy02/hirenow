import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";

type ApiErrorOptions = {
  fallback: string;
  fallbackStatus?: number;
};

const isDev = process.env.NODE_ENV !== "production";

// Classified by Prisma's own error types only. Matching on message text used to
// report SMTP "connection timeout" errors as a database outage.
function isDatabaseConnectionError(error: unknown) {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P1000" || error.code === "P1001" || error.code === "P1002" || error.code === "P1017";
  }

  return false;
}

function isPrismaError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientValidationError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientInitializationError
  );
}

export function apiErrorResponse(error: unknown, { fallback, fallbackStatus = 500 }: ApiErrorOptions) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "";

  if (isDatabaseConnectionError(error)) {
    return NextResponse.json(
      {
        error: "Database connection failed. Please make sure PostgreSQL is running and DATABASE_URL is correct.",
        ...(isDev ? { details: message } : {}),
      },
      { status: 503 },
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return NextResponse.json({ error: "That name or value is already in use." }, { status: 409 });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Prisma messages describe queries and schema internals; they are logged, not
  // returned. Other errors are thrown deliberately with user-facing text (for
  // example a spreadsheet missing a column), so their message is kept.
  if (isPrismaError(error)) {
    console.error("[hirenow] database error:", error);
    return NextResponse.json(
      { error: fallback, ...(isDev ? { details: message } : {}) },
      { status: fallbackStatus },
    );
  }

  return NextResponse.json({ error: message || fallback }, { status: fallbackStatus });
}
